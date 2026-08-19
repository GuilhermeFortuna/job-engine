import { beforeEach, describe, expect, it } from "vitest";

import { pageRuntimeScript } from "../../src/main/forms/page-script";
import {
  fillResultSchema,
  observeResultSchema,
} from "../../src/main/forms/types";

function render(html: string): void {
  document.body.innerHTML = html;
}

function observe() {
  return observeResultSchema.parse(pageRuntimeScript({ op: "observe" }));
}

function keyFor(label: string): string {
  const field = observe().fields.find((f) => f.label === label);
  if (!field) {
    throw new Error(`no observed field labelled ${label}`);
  }
  return field.semanticKey;
}

function fill(
  targets: { semanticKey: string; value: string | null; checked: boolean | null }[],
  expectedPageId = observe().pageId,
) {
  return fillResultSchema.parse(
    pageRuntimeScript({ op: "fill", expectedPageId, targets }),
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("text and textarea", () => {
  it("writes a value and verifies it from the page", () => {
    render(`<label for="a">Email</label><input id="a" type="email" />`);
    const result = fill([
      { semanticKey: keyFor("Email"), value: "a@b.co", checked: null },
    ]);
    expect(result.results[0].outcome).toBe("VERIFIED");
    expect(result.results[0].observedValue).toBe("a@b.co");
    expect((document.getElementById("a") as HTMLInputElement).value).toBe(
      "a@b.co",
    );
  });

  it("dispatches the events a controlled component listens for", () => {
    render(`<label for="a">Email</label><input id="a" />`);
    const seen: string[] = [];
    const el = document.getElementById("a")!;
    for (const name of ["input", "change", "blur"]) {
      el.addEventListener(name, () => seen.push(name));
    }
    fill([{ semanticKey: keyFor("Email"), value: "x", checked: null }]);
    expect(seen).toEqual(["input", "change", "blur"]);
  });

  it("fills a textarea", () => {
    render(`<label for="a">Cover letter</label><textarea id="a"></textarea>`);
    const result = fill([
      { semanticKey: keyFor("Cover letter"), value: "Hello", checked: null },
    ]);
    expect(result.results[0].outcome).toBe("VERIFIED");
    expect(result.results[0].observedValue).toBe("Hello");
  });

  it("round-trips hostile characters without evaluating them", () => {
    render(`<label for="a">Bio</label><textarea id="a"></textarea>`);
    const hostile = [
      `"'\`\\`,
      "line1\nline2",
      "\u2028\u2029",
      "</script><script>window.__pwned = true;</script>",
      "${process.exit(1)}",
      "\\x3c/script\\x3e",
    ].join("|");
    const result = fill([
      { semanticKey: keyFor("Bio"), value: hostile, checked: null },
    ]);
    expect(result.results[0].outcome).toBe("VERIFIED");
    expect(result.results[0].observedValue).toBe(hostile);
    expect((document.getElementById("a") as HTMLTextAreaElement).value).toBe(
      hostile,
    );
    expect(
      (window as unknown as Record<string, unknown>).__pwned,
    ).toBeUndefined();
  });
  it("normalizes CRLF the way the DOM does, so verification can match", () => {
    // HTML defines the textarea API value as newline-normalized, so a CRLF
    // answer can never be read back verbatim. Verification compares
    // normalized text for exactly this reason.
    render(`<label for="a">Bio</label><textarea id="a"></textarea>`);
    const result = fill([
      {
        semanticKey: keyFor("Bio"),
        value: "line1\r\nline2",
        checked: null,
      },
    ]);
    expect(result.results[0].observedValue).toBe("line1\nline2");
  });
});

describe("select", () => {
  it("selects an option by visible text", () => {
    render(`
      <label for="a">Country</label>
      <select id="a"><option>Brazil</option><option>Portugal</option></select>
    `);
    const result = fill([
      { semanticKey: keyFor("Country"), value: "Portugal", checked: null },
    ]);
    expect(result.results[0].outcome).toBe("VERIFIED");
    expect(result.results[0].observedValue).toBe("Portugal");
  });

  it("refuses a value that is not an offered option", () => {
    render(`
      <label for="a">Country</label>
      <select id="a"><option>Brazil</option></select>
    `);
    const result = fill([
      { semanticKey: keyFor("Country"), value: "Atlantis", checked: null },
    ]);
    expect(result.results[0].outcome).toBe("OPTION_MISSING");
  });
});

describe("radio and checkbox", () => {
  it("checks the matching radio option", () => {
    render(`
      <fieldset>
        <legend>Work authorization</legend>
        <label for="y">Yes</label><input id="y" type="radio" name="w" value="yes" />
        <label for="n">No</label><input id="n" type="radio" name="w" value="no" />
      </fieldset>
    `);
    const result = fill([
      {
        semanticKey: keyFor("Work authorization"),
        value: "Yes",
        checked: null,
      },
    ]);
    expect(result.results[0].outcome).toBe("VERIFIED");
    expect((document.getElementById("y") as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("refuses a radio option the group does not offer", () => {
    render(`
      <fieldset>
        <legend>Work authorization</legend>
        <label for="y">Yes</label><input id="y" type="radio" name="w" value="yes" />
      </fieldset>
    `);
    const result = fill([
      { semanticKey: keyFor("Work authorization"), value: "Maybe", checked: null },
    ]);
    expect(result.results[0].outcome).toBe("OPTION_MISSING");
  });

  it("sets and clears a checkbox", () => {
    render(`<label for="a">Subscribe</label><input id="a" type="checkbox" />`);
    const key = keyFor("Subscribe");
    expect(fill([{ semanticKey: key, value: null, checked: true }]).results[0])
      .toMatchObject({ outcome: "VERIFIED", observedChecked: true });
    expect(fill([{ semanticKey: key, value: null, checked: false }]).results[0])
      .toMatchObject({ outcome: "VERIFIED", observedChecked: false });
  });
});

describe("refusals", () => {
  it("never writes to a file input", () => {
    render(`<label for="a">Resume</label><input id="a" type="file" />`);
    const result = fill([
      { semanticKey: keyFor("Resume"), value: "/etc/passwd", checked: null },
    ]);
    expect(result.results[0].outcome).toBe("REJECTED");
  });

  it("refuses disabled and readonly controls", () => {
    render(`
      <label for="a">Email</label><input id="a" disabled />
      <label for="b">Phone</label><input id="b" readonly />
    `);
    render(`
      <label for="a">Email</label><input id="a" />
      <label for="b">Phone</label><input id="b" />
    `);
    const emailKey = keyFor("Email");
    const phoneKey = keyFor("Phone");
    (document.getElementById("a") as HTMLInputElement).disabled = true;
    (document.getElementById("b") as HTMLInputElement).readOnly = true;

    const result = fill([
      { semanticKey: emailKey, value: "x", checked: null },
      { semanticKey: phoneKey, value: "y", checked: null },
    ]);
    expect(result.results.map((r) => r.outcome)).toEqual([
      "DISABLED",
      "DISABLED",
    ]);
  });

  it("reports an unknown key rather than guessing a field", () => {
    render(`<label for="a">Email</label><input id="a" />`);
    const result = fill([
      { semanticKey: "not-a-real-key", value: "x", checked: null },
    ]);
    expect(result.results[0].outcome).toBe("NOT_FOUND");
    expect((document.getElementById("a") as HTMLInputElement).value).toBe("");
  });

  it("writes nothing when the page moved under the observation", () => {
    render(`<label for="a">Email</label><input id="a" />`);
    const key = keyFor("Email");
    const result = fill(
      [{ semanticKey: key, value: "x", checked: null }],
      "a-different-page",
    );
    expect(result.results[0].outcome).toBe("NOT_FOUND");
    expect((document.getElementById("a") as HTMLInputElement).value).toBe("");
  });

  it("cannot fill a control that was reported ambiguous", () => {
    render(`
      <label for="a">Email</label><input id="a" />
      <label for="b">Email</label><input id="b" />
    `);
    const result = fill([
      { semanticKey: "anything", value: "x", checked: null },
    ]);
    expect(result.results[0].outcome).toBe("NOT_FOUND");
    expect((document.getElementById("a") as HTMLInputElement).value).toBe("");
    expect((document.getElementById("b") as HTMLInputElement).value).toBe("");
  });
});

describe("activate", () => {
  it("clicks exactly the named control", () => {
    render(`
      <button type="button" id="next">Continue</button>
      <button type="button" id="submit">Submit application</button>
    `);
    const clicked: string[] = [];
    document
      .getElementById("next")!
      .addEventListener("click", () => clicked.push("next"));
    document
      .getElementById("submit")!
      .addEventListener("click", () => clicked.push("submit"));

    const result = pageRuntimeScript({
      op: "activate",
      kind: "advance",
      controlLabel: "continue",
    }) as { activated: boolean };
    expect(result.activated).toBe(true);
    expect(clicked).toEqual(["next"]);
  });

  it("reports failure instead of clicking a near match", () => {
    render(`<button type="button">Continue later</button>`);
    const result = pageRuntimeScript({
      op: "activate",
      kind: "advance",
      controlLabel: "continue",
    }) as { activated: boolean };
    expect(result.activated).toBe(false);
  });

  it("does not activate a disabled control", () => {
    render(`<button type="submit" disabled>Submit</button>`);
    const result = pageRuntimeScript({
      op: "activate",
      kind: "submit",
      controlLabel: "submit",
    }) as { activated: boolean };
    expect(result.activated).toBe(false);
  });
});
