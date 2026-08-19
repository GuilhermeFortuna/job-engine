import type { PageScriptArgs } from "./page-script";
import { pageRuntimeScript } from "./page-script";

/**
 * The subset of Electron's `webContents.debugger` this transport uses.
 *
 * Declared structurally so the transport can be exercised against a protocol
 * double without launching Electron.
 */
export interface DebuggerLike {
  isAttached(): boolean;
  attach(protocolVersion: string): void;
  detach(): void;
  sendCommand(method: string, params?: Record<string, unknown>): Promise<any>;
  on(
    event: "message",
    listener: (
      event: unknown,
      method: string,
      params: Record<string, unknown>,
    ) => void,
  ): void;
  off(
    event: "message",
    listener: (
      event: unknown,
      method: string,
      params: Record<string, unknown>,
    ) => void,
  ): void;
}

export const WORLD_NAME = "job-engine-runtime";
export const PROTOCOL_VERSION = "1.3";

/**
 * The exact text delivered to the page, taken from the compiled function and
 * nothing else.
 *
 * Frozen at module load: page text, API responses, and renderer input are
 * never concatenated into script source. Arguments travel separately, by
 * value, inside the CDP JSON envelope.
 */
export const SCRIPT_SOURCE: string = Object.freeze(
  pageRuntimeScript.toString(),
) as string;

export class IsolatedWorldError extends Error {}

/**
 * Runs the bundled page script in a dedicated isolated world.
 *
 * Electron's `executeJavaScriptInIsolatedWorld` takes source strings only, so
 * using it would force page-derived values to be interpolated into script
 * text. `Runtime.callFunctionOn` passes arguments by value instead, which is
 * why this transport goes through the debugger the resume upload already
 * needs. The isolation guarantee is the same; the argument handling is
 * strictly safer.
 */
export class IsolatedWorldSession {
  private frameId: string | null = null;
  private contextId: string | null = null;
  private attachedHere = false;
  private disposed = false;

  private readonly onMessage = (
    _event: unknown,
    method: string,
    params: Record<string, unknown>,
  ): void => {
    if (method === "Runtime.executionContextCreated") {
      const context = params.context as
        | {
            name?: string;
            uniqueId?: string;
            auxData?: { frameId?: string };
          }
        | undefined;
      if (context?.name === WORLD_NAME && context.uniqueId) {
        this.contextId = context.uniqueId;
      }
      return;
    }
    if (
      method === "Runtime.executionContextsCleared" ||
      method === "Page.frameNavigated"
    ) {
      // The world does not survive a navigation; force a rebuild rather than
      // calling into a context that no longer exists.
      this.contextId = null;
    }
  };

  constructor(private readonly target: DebuggerLike) {}

  async attach(): Promise<void> {
    if (this.disposed) {
      throw new IsolatedWorldError("Session already disposed");
    }
    if (!this.target.isAttached()) {
      this.target.attach(PROTOCOL_VERSION);
      this.attachedHere = true;
    }
    this.target.on("message", this.onMessage);
    await this.target.sendCommand("Page.enable");
    await this.target.sendCommand("Runtime.enable");
  }

  private async ensureWorld(): Promise<string> {
    if (this.contextId) {
      return this.contextId;
    }
    const tree = await this.target.sendCommand("Page.getFrameTree");
    const frameId = tree?.frameTree?.frame?.id;
    if (typeof frameId !== "string" || frameId === "") {
      throw new IsolatedWorldError("Could not resolve the main frame");
    }
    this.frameId = frameId;

    const created = await this.target.sendCommand("Page.createIsolatedWorld", {
      frameId,
      worldName: WORLD_NAME,
      grantUniveralAccess: false,
    });

    if (!this.contextId) {
      // Fall back to the numeric context id when the creation event has not
      // been delivered yet.
      const executionContextId = created?.executionContextId;
      if (typeof executionContextId !== "number") {
        throw new IsolatedWorldError("Could not create an isolated world");
      }
      this.contextId = null;
      return `#${executionContextId}`;
    }
    return this.contextId;
  }

  /** Run the bundled script with a structured argument passed by value. */
  async call(args: PageScriptArgs): Promise<unknown> {
    if (this.disposed) {
      throw new IsolatedWorldError("Session already disposed");
    }
    const context = await this.ensureWorld();
    const target = context.startsWith("#")
      ? { executionContextId: Number(context.slice(1)) }
      : { uniqueContextId: context };

    const response = await this.target.sendCommand("Runtime.callFunctionOn", {
      functionDeclaration: SCRIPT_SOURCE,
      // The one and only channel for data going into the page.
      arguments: [{ value: args }],
      returnByValue: true,
      awaitPromise: true,
      userGesture: false,
      ...target,
    });

    if (response?.exceptionDetails) {
      const text =
        response.exceptionDetails?.exception?.description ??
        response.exceptionDetails?.text ??
        "unknown error";
      throw new IsolatedWorldError(`Page script failed: ${String(text)}`);
    }
    return response?.result?.value;
  }

  /** Force the world to be rebuilt on the next call. */
  invalidate(): void {
    this.contextId = null;
  }

  get mainFrameId(): string | null {
    return this.frameId;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.contextId = null;
    try {
      this.target.off("message", this.onMessage);
    } catch {
      // The target may already be gone; disposal must never throw.
    }
    if (this.attachedHere) {
      try {
        this.target.detach();
      } catch {
        // Same: a destroyed webContents detaches itself.
      }
    }
  }
}
