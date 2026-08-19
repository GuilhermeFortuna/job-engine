import { describe, expect, it } from "vitest";

import { buildSemanticKey } from "../../src/main/forms/fingerprint";
import { pageRuntimeScript } from "../../src/main/forms/page-script";
import { observeResultSchema } from "../../src/main/forms/types";

/**
 * Rebuild the script the way the runtime actually delivers it: from its own
 * serialized source, evaluated with no surrounding module scope. If the
 * function ever reaches for an import or a module-level constant, the rebuilt
 * copy throws and this test fails.
 */
function rebuildFromSource(): (args: unknown) => unknown {
  const source = pageRuntimeScript.toString();
  return new Function(`return (${source});`)() as (args: unknown) => unknown;
}

describe("script self-containment", () => {
  it("serializes to a function declaration CDP can call", () => {
    const source = pageRuntimeScript.toString();
    expect(source.startsWith("function")).toBe(true);
  });

  it("runs correctly when evaluated with no module scope", () => {
    document.body.innerHTML = `
      <h1>Apply</h1>
      <label for="a">Email</label><input id="a" type="email" />
      <label for="b">Country</label>
      <select id="b"><option>Brazil</option></select>
    `;
    const rebuilt = rebuildFromSource();
    const result = observeResultSchema.parse(rebuilt({ op: "observe" }));
    expect(result.fields.map((f) => f.label).sort()).toEqual([
      "Country",
      "Email",
    ]);
  });

  it("produces identical output whether imported or rebuilt", () => {
    document.body.innerHTML = `
      <h1>Apply</h1>
      <label for="a">Email</label><input id="a" />
      <fieldset>
        <legend>Authorized to work?</legend>
        <label for="y">Yes</label><input id="y" type="radio" name="w" value="y" />
        <label for="n">No</label><input id="n" type="radio" name="w" value="n" />
      </fieldset>
    `;
    const imported = pageRuntimeScript({ op: "observe" });
    const rebuilt = rebuildFromSource()({ op: "observe" });
    expect(rebuilt).toEqual(imported);
  });

  it("contains no import, require, or module reference", () => {
    const source = pageRuntimeScript.toString();
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bimport\s*[({]/);
    expect(source).not.toMatch(/\bmodule\b/);
    expect(source).not.toMatch(/\bexports\b/);
  });
});

describe("semantic key parity with fingerprint.ts", () => {
  /**
   * The page cannot import `fingerprint.ts`, so the identity logic exists
   * twice. These cases pin the two implementations together; a drift in either
   * would silently break fill targeting and answer reuse.
   */
  const cases: [string, string, Parameters<typeof buildSemanticKey>[0]][] = [
    [
      "plain text field",
      `<label for="a">Email address</label><input id="a" type="email" />`,
      {
        pageId: "",
        accessibleName: "Email address",
        label: "Email address",
        controlType: "text",
        options: [],
      },
    ],
    [
      "label needing whitespace normalization",
      `<label for="a">  Full   name  *  </label><input id="a" />`,
      {
        pageId: "",
        accessibleName: "Full name *",
        label: "Full   name  *",
        controlType: "text",
        options: [],
      },
    ],
    [
      "select with options",
      `<label for="a">Country</label>
       <select id="a"><option>Portugal</option><option>Brazil</option></select>`,
      {
        pageId: "",
        accessibleName: "Country",
        label: "Country",
        controlType: "single_select",
        options: ["Portugal", "Brazil"],
      },
    ],
    [
      "aria-labelled textarea",
      `<textarea aria-label="Cover letter"></textarea>`,
      {
        pageId: "",
        accessibleName: "Cover letter",
        label: "",
        controlType: "textarea",
        options: [],
      },
    ],
  ];

  it.each(cases)("agrees for a %s", (_name, html, expected) => {
    document.body.innerHTML = html;
    const result = observeResultSchema.parse(
      pageRuntimeScript({ op: "observe" }),
    );
    expect(result.fields).toHaveLength(1);
    const nodeKey = buildSemanticKey({ ...expected, pageId: result.pageId });
    expect(result.fields[0].semanticKey).toBe(nodeKey);
  });

  it("agrees on a radio group named by its legend", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Work authorization</legend>
        <label for="y">Yes</label><input id="y" type="radio" name="w" value="y" />
        <label for="n">No</label><input id="n" type="radio" name="w" value="n" />
      </fieldset>
    `;
    const result = observeResultSchema.parse(
      pageRuntimeScript({ op: "observe" }),
    );
    expect(
      buildSemanticKey({
        pageId: result.pageId,
        accessibleName: "Work authorization",
        label: "Work authorization",
        controlType: "radio",
        options: ["Yes", "No"],
      }),
    ).toBe(result.fields[0].semanticKey);
  });
});
