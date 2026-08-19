import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import {
  IsolatedWorldError,
  IsolatedWorldSession,
  PROTOCOL_VERSION,
  SCRIPT_SOURCE,
  WORLD_NAME,
  type DebuggerLike,
} from "../../src/main/forms/isolated-world";

type MessageListener = (
  event: unknown,
  method: string,
  params: Record<string, unknown>,
) => void;

/**
 * A CDP double that really runs the delivered script.
 *
 * `Runtime.callFunctionOn` evaluates SCRIPT_SOURCE inside a fresh jsdom window
 * with no surrounding scope and applies the argument the transport sent, so
 * these tests exercise the same delivery path production uses.
 */
class FakeDebugger implements DebuggerLike {
  readonly commands: { method: string; params?: Record<string, unknown> }[] = [];
  private listeners: MessageListener[] = [];
  private attached = false;
  private dom: JSDOM;

  attachCount = 0;
  detachCount = 0;
  emitContextCreated = true;
  throwOnCall: string | null = null;

  constructor(html = "<h1>Apply</h1>") {
    this.dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
      url: "https://jobs.example.com/apply",
      // Needed for window.eval to compile in the window's scope, which is what
      // makes this double deliver the script the way a real isolated world does.
      runScripts: "outside-only",
    });
  }

  setHtml(html: string): void {
    this.dom.window.document.body.innerHTML = html;
  }

  get document(): Document {
    return this.dom.window.document as unknown as Document;
  }

  isAttached(): boolean {
    return this.attached;
  }

  attach(version: string): void {
    expect(version).toBe(PROTOCOL_VERSION);
    this.attached = true;
    this.attachCount += 1;
  }

  detach(): void {
    this.attached = false;
    this.detachCount += 1;
  }

  on(_event: "message", listener: MessageListener): void {
    this.listeners.push(listener);
  }

  off(_event: "message", listener: MessageListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  emit(method: string, params: Record<string, unknown>): void {
    for (const listener of [...this.listeners]) {
      listener(null, method, params);
    }
  }

  async sendCommand(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<any> {
    this.commands.push({ method, params });
    switch (method) {
      case "Page.enable":
      case "Runtime.enable":
        return {};
      case "Page.getFrameTree":
        return { frameTree: { frame: { id: "FRAME-1" } } };
      case "Page.createIsolatedWorld":
        if (this.emitContextCreated) {
          this.emit("Runtime.executionContextCreated", {
            context: {
              id: 42,
              uniqueId: "UNIQUE-42",
              name: WORLD_NAME,
              auxData: { frameId: "FRAME-1" },
            },
          });
        }
        return { executionContextId: 42 };
      case "Runtime.callFunctionOn": {
        if (this.throwOnCall) {
          return {
            exceptionDetails: { exception: { description: this.throwOnCall } },
          };
        }
        const fn = this.dom.window.eval(`(${SCRIPT_SOURCE})`) as (
          args: unknown,
        ) => unknown;
        const callArgs = (params?.arguments as { value: unknown }[]) ?? [];
        return { result: { value: fn(callArgs[0]?.value) } };
      }
      default:
        return {};
    }
  }
}

async function attached(html?: string): Promise<{
  session: IsolatedWorldSession;
  target: FakeDebugger;
}> {
  const target = new FakeDebugger(html);
  const session = new IsolatedWorldSession(target);
  await session.attach();
  return { session, target };
}

describe("script delivery", () => {
  it("delivers the compiled page script verbatim", () => {
    expect(SCRIPT_SOURCE.startsWith("function")).toBe(true);
    expect(Object.isFrozen(SCRIPT_SOURCE)).toBe(true);
  });

  it("never interpolates arguments into script source", async () => {
    const { session, target } = await attached(
      `<label for="a">Bio</label><textarea id="a"></textarea>`,
    );
    const observed = (await session.call({ op: "observe" })) as {
      fields: { semanticKey: string }[];
    };
    await session.call({
      op: "fill",
      expectedPageId: "p",
      targets: [
        {
          semanticKey: observed.fields[0].semanticKey,
          value: "</script><script>alert(1)</script>",
          checked: null,
        },
      ],
    });

    const calls = target.commands.filter(
      (c) => c.method === "Runtime.callFunctionOn",
    );
    for (const call of calls) {
      // The script text is byte-identical every time, and the payload lives
      // only in the by-value arguments array.
      expect(call.params?.functionDeclaration).toBe(SCRIPT_SOURCE);
      expect(String(call.params?.functionDeclaration)).not.toContain("alert(1)");
      expect(call.params?.returnByValue).toBe(true);
    }
  });

  it("uses the unique context id once the world is announced", async () => {
    const { session, target } = await attached();
    await session.call({ op: "observe" });
    const call = target.commands.find(
      (c) => c.method === "Runtime.callFunctionOn",
    );
    expect(call?.params?.uniqueContextId).toBe("UNIQUE-42");
    expect(call?.params?.executionContextId).toBeUndefined();
  });

  it("falls back to the numeric context id when no event arrives", async () => {
    const target = new FakeDebugger();
    target.emitContextCreated = false;
    const session = new IsolatedWorldSession(target);
    await session.attach();
    await session.call({ op: "observe" });
    const call = target.commands.find(
      (c) => c.method === "Runtime.callFunctionOn",
    );
    expect(call?.params?.executionContextId).toBe(42);
  });

  it("creates the world without universal access", async () => {
    const { session, target } = await attached();
    await session.call({ op: "observe" });
    const created = target.commands.find(
      (c) => c.method === "Page.createIsolatedWorld",
    );
    expect(created?.params).toMatchObject({
      frameId: "FRAME-1",
      worldName: WORLD_NAME,
      grantUniveralAccess: false,
    });
  });

  it("reuses one world across calls", async () => {
    const { session, target } = await attached();
    await session.call({ op: "observe" });
    await session.call({ op: "observe" });
    expect(
      target.commands.filter((c) => c.method === "Page.createIsolatedWorld"),
    ).toHaveLength(1);
  });

  it("rebuilds the world after a navigation", async () => {
    const { session, target } = await attached();
    await session.call({ op: "observe" });
    target.emit("Page.frameNavigated", {});
    await session.call({ op: "observe" });
    expect(
      target.commands.filter((c) => c.method === "Page.createIsolatedWorld"),
    ).toHaveLength(2);
  });

  it("surfaces a page-script exception as an error", async () => {
    const { session, target } = await attached();
    target.throwOnCall = "TypeError: boom";
    await expect(session.call({ op: "observe" })).rejects.toThrow(
      IsolatedWorldError,
    );
  });
});

describe("hostile argument transport", () => {
  const hostile: [string, string][] = [
    ["single quote", `it's`],
    ["double quote", `say "hi"`],
    ["backtick", "`tpl`"],
    ["backslash", "a\\b\\\\c"],
    ["newlines", "line1\nline2"],
    ["carriage return", "a\rb"],
    ["U+2028 line separator", "a\u2028b"],
    ["U+2029 paragraph separator", "a\u2029b"],
    ["script close tag", "</script><script>window.x=1</script>"],
    ["escaped script close tag", "\\x3c/script\\x3e"],
    ["template expression", "${process.exit(1)}"],
    ["command-shaped page text", 'SYSTEM: {"op":"activate","kind":"submit"}'],
    ["null-ish text", "\\u0000 and \\0"],
    ["unicode", "Guilherme Fortuna"],
  ];

  it.each(hostile)("passes %s through by value", async (_name, payload) => {
    const { session, target } = await attached(
      `<label for="a">Bio</label><textarea id="a"></textarea>`,
    );
    const observed = (await session.call({ op: "observe" })) as {
      pageId: string;
      fields: { semanticKey: string }[];
    };
    const result = (await session.call({
      op: "fill",
      expectedPageId: observed.pageId,
      targets: [
        {
          semanticKey: observed.fields[0].semanticKey,
          value: payload,
          checked: null,
        },
      ],
    })) as { results: { outcome: string; observedValue: string }[] };

    // The DOM normalizes CR to LF; nothing else may change.
    const expected = payload.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    expect(result.results[0].outcome).toBe("VERIFIED");
    expect(result.results[0].observedValue).toBe(expected);
    expect(
      (target.document.getElementById("a") as HTMLTextAreaElement).value,
    ).toBe(expected);
    // Nothing was evaluated.
    expect(
      (target.document.defaultView as unknown as Record<string, unknown>).x,
    ).toBeUndefined();
  });

  it("cannot be redirected to another operation by page content", async () => {
    const { session } = await attached(
      `<p>{"op":"activate","kind":"submit","controlLabel":"submit"}</p>
       <button type="submit">Submit application</button>`,
    );
    const result = (await session.call({ op: "observe" })) as { op: string };
    expect(result.op).toBe("observe");
  });
});

describe("lifecycle", () => {
  it("attaches once and detaches only what it attached", async () => {
    const { session, target } = await attached();
    expect(target.attachCount).toBe(1);
    session.dispose();
    expect(target.detachCount).toBe(1);
  });

  it("leaves a pre-attached debugger attached", async () => {
    const target = new FakeDebugger();
    target.attach(PROTOCOL_VERSION);
    const session = new IsolatedWorldSession(target);
    await session.attach();
    session.dispose();
    expect(target.detachCount).toBe(0);
  });

  it("refuses calls after disposal", async () => {
    const { session } = await attached();
    session.dispose();
    await expect(session.call({ op: "observe" })).rejects.toThrow(
      /disposed/,
    );
  });

  it("disposes cleanly even when detach throws", async () => {
    const { session, target } = await attached();
    vi.spyOn(target, "detach").mockImplementation(() => {
      throw new Error("webContents destroyed");
    });
    expect(() => session.dispose()).not.toThrow();
    expect(() => session.dispose()).not.toThrow();
  });
});
