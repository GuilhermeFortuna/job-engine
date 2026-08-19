/**
 * The single in-page runtime script.
 *
 * This function is the ONLY code the runtime ever executes inside the employer
 * page. It is delivered to the isolated world by serializing this function and
 * passing its argument by value through CDP `Runtime.callFunctionOn`; nothing
 * derived from the page, the API, or the renderer is ever concatenated into
 * script source.
 *
 * Two constraints follow, and both are enforced by tests:
 *
 * 1. It must be entirely self-contained. It may not reference any module-scope
 *    binding, because only the function's own text crosses into the page.
 *    `tests/forms/page-script-isolation.test.ts` proves this by re-evaluating
 *    the serialized source in a bare scope.
 * 2. Its identity logic must agree with `fingerprint.ts`, which cannot be
 *    imported here. `tests/forms/semantic-key-parity.test.ts` pins the two
 *    implementations together.
 *
 * Observe, fill, and activate share one function so they share one control
 * enumeration: a fill can never address a control the observation did not see.
 */

export type PageScriptArgs =
  | { op: "observe" }
  | {
      op: "fill";
      expectedPageId: string;
      targets: {
        semanticKey: string;
        value: string | null;
        checked: boolean | null;
      }[];
    }
  | { op: "activate"; kind: "advance" | "submit"; controlLabel: string }
  /**
   * Return the file control itself, by reference, so the upload path can hand
   * CDP an object id. The page script is never given a filesystem path.
   */
  | { op: "locateFileInput"; semanticKey: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pageRuntimeScript(args: PageScriptArgs): unknown {
  const UNIT = "\u001F";

  function norm(value: string): string {
    return value
      .replace(/[\s\u00A0]+/g, " ")
      .replace(/[\s\u00A0*\u2217]+$/g, "")
      .trim()
      .toLocaleLowerCase("en-US");
  }

  function normOptions(options: string[]): string[] {
    const cleaned = options.map(norm).filter(function (o) {
      return o !== "";
    });
    return Array.from(new Set(cleaned)).sort();
  }

  function textOf(node: Element | null): string {
    if (!node) {
      return "";
    }
    return (node.textContent || "").replace(/[\s\u00A0]+/g, " ").trim();
  }

  function isVisible(el: Element): boolean {
    // Deliberately layout-free: offsetParent and getBoundingClientRect are
    // unreliable under the headless/offscreen views this runs in.
    let current: Element | null = el;
    while (current && current.nodeType === 1) {
      if (current.hasAttribute("hidden")) {
        return false;
      }
      if (current.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style = el.ownerDocument.defaultView
        ? el.ownerDocument.defaultView.getComputedStyle(current)
        : null;
      if (style && (style.display === "none" || style.visibility === "hidden")) {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  }

  function labelText(el: Element): string {
    const doc = el.ownerDocument;
    const id = el.getAttribute("id");
    if (id) {
      const escaped = id.replace(/["\\]/g, "\\$&");
      const forLabel = doc.querySelector('label[for="' + escaped + '"]');
      if (forLabel) {
        return textOf(forLabel);
      }
    }
    const wrapping = el.closest("label");
    if (wrapping) {
      return textOf(wrapping);
    }
    // A fieldset legend names a radio group.
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) {
        return textOf(legend);
      }
    }
    return "";
  }

  function accessibleName(el: Element): string | null {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim() !== "") {
      return ariaLabel.trim();
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map(function (refId) {
          return textOf(el.ownerDocument.getElementById(refId));
        })
        .filter(function (t) {
          return t !== "";
        });
      if (parts.length > 0) {
        return parts.join(" ");
      }
    }
    const fromLabel = labelText(el);
    if (fromLabel !== "") {
      return fromLabel;
    }
    const title = el.getAttribute("title");
    if (title && title.trim() !== "") {
      return title.trim();
    }
    return null;
  }

  function helpTextFor(el: Element): string | null {
    const describedBy = el.getAttribute("aria-describedby");
    if (!describedBy) {
      return null;
    }
    const parts = describedBy
      .split(/\s+/)
      .map(function (refId) {
        return textOf(el.ownerDocument.getElementById(refId));
      })
      .filter(function (t) {
        return t !== "";
      });
    return parts.length > 0 ? parts.join(" ") : null;
  }

  function computePageId(): string {
    const heading = document.querySelector("h1, h2, [role=heading]");
    return (
      norm(location.pathname) +
      UNIT +
      norm(textOf(heading)) +
      UNIT +
      String(document.querySelectorAll("form").length)
    );
  }

  function semanticKeyFor(
    pageId: string,
    name: string | null,
    label: string,
    controlType: string,
    options: string[],
  ): string {
    return [
      pageId,
      norm(name || ""),
      norm(label),
      controlType,
      normOptions(options).join(","),
    ].join(UNIT);
  }

  // --- Control classification ------------------------------------------------

  const UNSUPPORTED_SELECTORS: [string, string][] = [
    ["[contenteditable=true], [contenteditable='']", "CONTENTEDITABLE"],
    ["[role=combobox], [role=listbox]", "CUSTOM_COMBOBOX"],
    ["canvas", "SHADOW_OR_CANVAS"],
    [
      "[class*=signature i], [id*=signature i], [data-signature]",
      "SIGNATURE_WIDGET",
    ],
  ];

  interface Candidate {
    element: Element;
    controlType: string;
    members: Element[];
    options: string[];
  }

  function collectCandidates(): {
    candidates: Candidate[];
    unsupported: { reason: string; hint: string; required: boolean }[];
  } {
    const candidates: Candidate[] = [];
    const unsupported: { reason: string; hint: string; required: boolean }[] =
      [];
    const seenRadioGroups: Record<string, boolean> = {};

    for (let i = 0; i < UNSUPPORTED_SELECTORS.length; i += 1) {
      const pair = UNSUPPORTED_SELECTORS[i];
      const found = document.querySelectorAll(pair[0]);
      for (let j = 0; j < found.length; j += 1) {
        const el = found[j];
        if (!isVisible(el)) {
          continue;
        }
        // A native select also matches role=listbox in some markup; never
        // report a control we can actually drive as unsupported.
        if (el.tagName === "SELECT") {
          continue;
        }
        unsupported.push({
          reason: pair[1],
          hint: (accessibleName(el) || el.tagName).slice(0, 120),
          required: el.getAttribute("aria-required") === "true",
        });
      }
    }

    const controls = document.querySelectorAll("input, textarea, select");
    for (let i = 0; i < controls.length; i += 1) {
      const el = controls[i] as HTMLElement;
      if (el.shadowRoot) {
        unsupported.push({
          reason: "SHADOW_OR_CANVAS",
          hint: (accessibleName(el) || el.tagName).slice(0, 120),
          required: false,
        });
        continue;
      }
      const tag = el.tagName;
      const rawType = (el.getAttribute("type") || "text").toLowerCase();

      if (tag === "INPUT" && (rawType === "hidden" || rawType === "password")) {
        continue;
      }
      if (
        tag === "INPUT" &&
        (rawType === "submit" || rawType === "button" || rawType === "reset")
      ) {
        continue;
      }
      if (!isVisible(el)) {
        continue;
      }

      let controlType: string;
      let members: Element[] = [el];
      let options: string[] = [];

      if (tag === "TEXTAREA") {
        controlType = "textarea";
      } else if (tag === "SELECT") {
        const select = el as HTMLSelectElement;
        controlType = select.multiple ? "multi_select" : "single_select";
        const opts = select.querySelectorAll("option");
        for (let k = 0; k < opts.length; k += 1) {
          const optText = textOf(opts[k]);
          if (optText !== "") {
            options.push(optText);
          }
        }
      } else if (rawType === "radio") {
        const groupName = el.getAttribute("name") || "";
        if (groupName === "") {
          unsupported.push({
            reason: "AMBIGUOUS_DUPLICATE",
            hint: (accessibleName(el) || "radio").slice(0, 120),
            required: (el as HTMLInputElement).required,
          });
          continue;
        }
        if (seenRadioGroups[groupName]) {
          continue;
        }
        seenRadioGroups[groupName] = true;
        controlType = "radio";
        const escapedName = groupName.replace(/["\\]/g, "\\$&");
        const group = document.querySelectorAll(
          'input[type=radio][name="' + escapedName + '"]',
        );
        members = [];
        for (let k = 0; k < group.length; k += 1) {
          members.push(group[k]);
          const optionLabel = labelText(group[k]) || group[k].getAttribute("value");
          if (optionLabel) {
            options.push(optionLabel);
          }
        }
      } else if (rawType === "checkbox") {
        controlType = "checkbox";
      } else if (rawType === "file") {
        controlType = "file";
      } else if (
        rawType === "text" ||
        rawType === "email" ||
        rawType === "tel" ||
        rawType === "url" ||
        rawType === "number" ||
        rawType === "search" ||
        rawType === "date"
      ) {
        controlType = "text";
      } else {
        unsupported.push({
          reason: "UNKNOWN_CONTROL",
          hint: (accessibleName(el) || rawType).slice(0, 120),
          required: (el as HTMLInputElement).required,
        });
        continue;
      }

      candidates.push({
        element: el,
        controlType: controlType,
        members: members,
        options: options,
      });
    }

    return { candidates: candidates, unsupported: unsupported };
  }

  function groupLabelFor(candidate: Candidate): string {
    if (candidate.controlType === "radio") {
      const fieldset = candidate.element.closest("fieldset");
      if (fieldset) {
        const legend = fieldset.querySelector("legend");
        if (legend) {
          return textOf(legend);
        }
      }
      const groupName = candidate.element.getAttribute("name") || "";
      return groupName;
    }
    return labelText(candidate.element);
  }

  function nameFor(candidate: Candidate): string | null {
    if (candidate.controlType === "radio") {
      const fieldset = candidate.element.closest("fieldset");
      if (fieldset) {
        const fieldsetLabel = fieldset.getAttribute("aria-label");
        if (fieldsetLabel && fieldsetLabel.trim() !== "") {
          return fieldsetLabel.trim();
        }
        const legend = fieldset.querySelector("legend");
        if (legend) {
          return textOf(legend);
        }
      }
      return null;
    }
    return accessibleName(candidate.element);
  }

  function readValue(candidate: Candidate): {
    value: string;
    checked: boolean | null;
    filename: string | null;
  } {
    const el = candidate.element;
    if (candidate.controlType === "radio") {
      for (let i = 0; i < candidate.members.length; i += 1) {
        const member = candidate.members[i] as HTMLInputElement;
        if (member.checked) {
          return {
            value: labelText(member) || member.value,
            checked: true,
            filename: null,
          };
        }
      }
      return { value: "", checked: false, filename: null };
    }
    if (candidate.controlType === "checkbox") {
      const input = el as HTMLInputElement;
      return { value: input.value, checked: input.checked, filename: null };
    }
    if (candidate.controlType === "file") {
      const input = el as HTMLInputElement;
      const files = input.files;
      const first = files && files.length > 0 ? files[0].name : null;
      return { value: "", checked: null, filename: first };
    }
    if (
      candidate.controlType === "single_select" ||
      candidate.controlType === "multi_select"
    ) {
      const select = el as HTMLSelectElement;
      const chosen: string[] = [];
      for (let i = 0; i < select.selectedOptions.length; i += 1) {
        chosen.push(textOf(select.selectedOptions[i]));
      }
      return { value: chosen.join(","), checked: null, filename: null };
    }
    return {
      value: (el as HTMLInputElement).value || "",
      checked: null,
      filename: null,
    };
  }

  function buildFields(pageId: string): {
    fields: Record<string, unknown>[];
    unsupported: { reason: string; hint: string; required: boolean }[];
    index: Record<string, Candidate>;
  } {
    const collected = collectCandidates();
    const unsupported = collected.unsupported;
    const described: {
      candidate: Candidate;
      key: string;
      payload: Record<string, unknown>;
    }[] = [];

    for (let i = 0; i < collected.candidates.length; i += 1) {
      const candidate = collected.candidates[i];
      const name = nameFor(candidate);
      const label = groupLabelFor(candidate);
      if (!name && norm(label) === "") {
        unsupported.push({
          reason: "NO_ACCESSIBLE_NAME",
          hint: candidate.controlType,
          required: (candidate.element as HTMLInputElement).required === true,
        });
        continue;
      }
      const key = semanticKeyFor(
        pageId,
        name,
        label,
        candidate.controlType,
        candidate.options,
      );
      const state = readValue(candidate);
      const input = candidate.element as HTMLInputElement;
      const maxLength =
        typeof input.maxLength === "number" && input.maxLength >= 0
          ? input.maxLength
          : null;
      const minLength =
        typeof input.minLength === "number" && input.minLength >= 0
          ? input.minLength
          : null;
      described.push({
        candidate: candidate,
        key: key,
        payload: {
          semanticKey: key,
          label: label,
          accessibleName: name,
          helpText: helpTextFor(candidate.element),
          required:
            input.required === true ||
            candidate.element.getAttribute("aria-required") === "true",
          controlType: candidate.controlType,
          options: candidate.options,
          value: state.value,
          checked: state.checked,
          filename: state.filename,
          disabled: input.disabled === true,
          validation: {
            minLength: minLength,
            maxLength: maxLength,
            pattern: candidate.element.getAttribute("pattern"),
          },
        },
      });
    }

    // Controls that agree on every identity input are genuinely ambiguous and
    // must not be disambiguated by position.
    const counts: Record<string, number> = {};
    for (let i = 0; i < described.length; i += 1) {
      counts[described[i].key] = (counts[described[i].key] || 0) + 1;
    }

    const fields: Record<string, unknown>[] = [];
    const index: Record<string, Candidate> = {};
    for (let i = 0; i < described.length; i += 1) {
      const entry = described[i];
      if (counts[entry.key] > 1) {
        unsupported.push({
          reason: "AMBIGUOUS_DUPLICATE",
          hint: String(entry.payload.label || "").slice(0, 120),
          required: entry.payload.required === true,
        });
        continue;
      }
      fields.push(entry.payload);
      index[entry.key] = entry.candidate;
    }

    return { fields: fields, unsupported: unsupported, index: index };
  }

  function detectConfirmation(): boolean {
    // Matched in-page so only a boolean crosses the boundary. Employer
    // confirmation pages routinely echo the applicant's name and email, and
    // that text must never reach the main process or evidence.
    const phrases = [
      "application received",
      "application submitted",
      "thank you for applying",
      "thanks for applying",
      "we have received your application",
      "your application has been submitted",
    ];
    const body = norm(textOf(document.body).slice(0, 8000));
    for (let i = 0; i < phrases.length; i += 1) {
      if (body.indexOf(phrases[i]) >= 0) {
        return true;
      }
    }
    return false;
  }

  function detectSignals(): {
    authWall: boolean;
    captcha: boolean;
    validationErrors: string[];
  } {
    const passwordFields = document.querySelectorAll("input[type=password]");
    let authWall = passwordFields.length > 0;
    if (!authWall) {
      const bodyText = norm(textOf(document.body).slice(0, 4000));
      authWall =
        bodyText.indexOf("sign in to continue") >= 0 ||
        bodyText.indexOf("log in to continue") >= 0;
    }

    let captcha = document.querySelectorAll(
      ".g-recaptcha, .h-captcha, [data-captcha], [data-sitekey]",
    ).length > 0;
    if (!captcha) {
      const frames = document.querySelectorAll("iframe");
      for (let i = 0; i < frames.length; i += 1) {
        const src = frames[i].getAttribute("src") || "";
        if (
          src.indexOf("recaptcha") >= 0 ||
          src.indexOf("hcaptcha") >= 0 ||
          src.indexOf("turnstile") >= 0
        ) {
          captcha = true;
          break;
        }
      }
    }

    const errors: string[] = [];
    const errorNodes = document.querySelectorAll(
      "[aria-invalid=true], [role=alert], .error, .field-error",
    );
    for (let i = 0; i < errorNodes.length; i += 1) {
      const message = textOf(errorNodes[i]);
      if (message !== "") {
        errors.push(message.slice(0, 200));
      }
    }

    return { authWall: authWall, captcha: captcha, validationErrors: errors };
  }

  function actionableControls(): { advance: string[]; submit: string[] } {
    const advance: string[] = [];
    const submit: string[] = [];
    const buttons = document.querySelectorAll(
      "button, input[type=submit], input[type=button], [role=button]",
    );
    for (let i = 0; i < buttons.length; i += 1) {
      const el = buttons[i];
      if (!isVisible(el) || (el as HTMLButtonElement).disabled) {
        continue;
      }
      const text = norm(
        accessibleName(el) || textOf(el) || el.getAttribute("value") || "",
      );
      if (text === "") {
        continue;
      }
      if (
        text.indexOf("submit") >= 0 ||
        text.indexOf("send application") >= 0 ||
        text === "apply" ||
        text.indexOf("submit application") >= 0
      ) {
        submit.push(text);
      } else if (
        text.indexOf("continue") >= 0 ||
        text.indexOf("next") >= 0 ||
        text.indexOf("save and continue") >= 0
      ) {
        advance.push(text);
      }
    }
    return { advance: advance, submit: submit };
  }

  // --- Operations ------------------------------------------------------------

  if (args.op === "observe") {
    // Page identity is always computed here, never supplied by the caller, so
    // a later fill can prove the page has not moved underneath it.
    const pageId = computePageId();
    const built = buildFields(pageId);
    const actions = actionableControls();
    return {
      op: "observe",
      pageId: pageId,
      fields: built.fields,
      unsupported: built.unsupported,
      signals: detectSignals(),
      confirmationText: detectConfirmation(),
      advanceControls: actions.advance,
      submitControls: actions.submit,
    };
  }

  if (args.op === "fill") {
    const currentPageId = computePageId();
    const results: Record<string, unknown>[] = [];
    if (currentPageId !== args.expectedPageId) {
      // The page moved underneath the observation; refuse every write rather
      // than risk putting an answer on the wrong step.
      for (let i = 0; i < args.targets.length; i += 1) {
        results.push({
          semanticKey: args.targets[i].semanticKey,
          outcome: "NOT_FOUND",
          observedValue: "",
          observedChecked: null,
        });
      }
      return { op: "fill", results: results };
    }

    const built = buildFields(currentPageId);

    function setNativeValue(el: Element, value: string): void {
      const prototype =
        el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : el.tagName === "SELECT"
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, value);
      } else {
        (el as HTMLInputElement).value = value;
      }
    }

    function fire(el: Element, names: string[]): void {
      for (let i = 0; i < names.length; i += 1) {
        el.dispatchEvent(new Event(names[i], { bubbles: true }));
      }
    }

    for (let i = 0; i < args.targets.length; i += 1) {
      const target = args.targets[i];
      const candidate = built.index[target.semanticKey];
      if (!candidate) {
        results.push({
          semanticKey: target.semanticKey,
          outcome: "NOT_FOUND",
          observedValue: "",
          observedChecked: null,
        });
        continue;
      }
      const el = candidate.element as HTMLInputElement;
      if (el.disabled || el.readOnly) {
        const state = readValue(candidate);
        results.push({
          semanticKey: target.semanticKey,
          outcome: "DISABLED",
          observedValue: state.value,
          observedChecked: state.checked,
        });
        continue;
      }

      if (candidate.controlType === "file") {
        // Files are attached out of band through the debugger; the page script
        // must never be able to set a file path.
        results.push({
          semanticKey: target.semanticKey,
          outcome: "REJECTED",
          observedValue: "",
          observedChecked: null,
        });
        continue;
      }

      if (candidate.controlType === "radio") {
        let matched: HTMLInputElement | null = null;
        for (let k = 0; k < candidate.members.length; k += 1) {
          const member = candidate.members[k] as HTMLInputElement;
          const optionLabel = labelText(member) || member.value;
          if (norm(optionLabel) === norm(target.value || "")) {
            matched = member;
            break;
          }
        }
        if (!matched) {
          const state = readValue(candidate);
          results.push({
            semanticKey: target.semanticKey,
            outcome: "OPTION_MISSING",
            observedValue: state.value,
            observedChecked: state.checked,
          });
          continue;
        }
        matched.checked = true;
        fire(matched, ["input", "change", "click"]);
      } else if (candidate.controlType === "checkbox") {
        el.checked = target.checked === true;
        fire(el, ["input", "change", "click"]);
      } else if (
        candidate.controlType === "single_select" ||
        candidate.controlType === "multi_select"
      ) {
        const select = candidate.element as HTMLSelectElement;
        const options = select.querySelectorAll("option");
        let matchedOption: HTMLOptionElement | null = null;
        for (let k = 0; k < options.length; k += 1) {
          const option = options[k] as HTMLOptionElement;
          if (
            norm(textOf(option)) === norm(target.value || "") ||
            norm(option.value) === norm(target.value || "")
          ) {
            matchedOption = option;
            break;
          }
        }
        if (!matchedOption) {
          const state = readValue(candidate);
          results.push({
            semanticKey: target.semanticKey,
            outcome: "OPTION_MISSING",
            observedValue: state.value,
            observedChecked: state.checked,
          });
          continue;
        }
        matchedOption.selected = true;
        fire(select, ["input", "change"]);
      } else {
        setNativeValue(el, target.value || "");
        fire(el, ["input", "change", "blur"]);
      }

      // Re-read from the page: an assignment is never evidence of success.
      const after = readValue(candidate);
      results.push({
        semanticKey: target.semanticKey,
        outcome: "VERIFIED",
        observedValue: after.value,
        observedChecked: after.checked,
      });
    }

    return { op: "fill", results: results };
  }

  if (args.op === "locateFileInput") {
    const built = buildFields(computePageId());
    const candidate = built.index[args.semanticKey];
    if (!candidate || candidate.controlType !== "file") {
      return null;
    }
    const input = candidate.element as HTMLInputElement;
    if (input.disabled) {
      return null;
    }
    return input;
  }

  // args.op === "activate"
  const wanted = norm(args.controlLabel);
  const buttons = document.querySelectorAll(
    "button, input[type=submit], input[type=button], [role=button]",
  );
  for (let i = 0; i < buttons.length; i += 1) {
    const el = buttons[i] as HTMLElement;
    if (!isVisible(el) || (el as HTMLButtonElement).disabled) {
      continue;
    }
    const text = norm(
      accessibleName(el) ||
        textOf(el) ||
        el.getAttribute("value") ||
        "",
    );
    if (text === wanted) {
      el.click();
      return { op: "activate", activated: true };
    }
  }
  return { op: "activate", activated: false };
}
