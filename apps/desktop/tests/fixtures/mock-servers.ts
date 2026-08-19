import http from "node:http";
import https from "node:https";
import { TEST_SSL_CERT, TEST_SSL_KEY } from "./certs";

export interface MockRunData {
  id: string;
  job_group_id: string;
  application_url: string;
  canonical_application_url: string;
  platform_adapter_id: string;
  status: string;
}

export class MockBackendServer {
  private server: http.Server;
  private runs: Map<string, MockRunData> = new Map();
  public port: number = 0;
  public baseUrl: string = "";

  constructor() {
    this.server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);
      const match = url.pathname.match(/^\/api\/v1\/application-runs\/([^/]+)$/);

      if (req.method === "GET" && match) {
        const runId = match[1];
        const run = this.runs.get(runId);
        if (run) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(run));
          return;
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ detail: `Application run ${runId} not found` }));
          return;
        }
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "Not found" }));
    });
  }

  public setRun(run: MockRunData): void {
    this.runs.set(run.id, run);
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address() as any;
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

export class MockHttpsAtsServer {
  private server: https.Server;
  public port: number = 0;
  public baseUrl: string = "";

  constructor() {
    this.server = https.createServer(
      {
        key: TEST_SSL_KEY,
        cert: TEST_SSL_CERT,
      },
      (req, res) => {
        const url = new URL(req.url || "/", `https://127.0.0.1:${this.port}`);

        if (url.pathname === "/apply/step1") {
          res.writeHead(200, {
            "Content-Type": "text/html",
            "Set-Cookie": "ats_session=session_token_synth_12345; Path=/; Secure; HttpOnly; SameSite=Strict",
          });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Synthetic ATS Step 1</title></head>
<body>
  <h1>Step 1: Application Form</h1>
  <a id="btn-next" href="/apply/step2">Next Step</a>
  <button id="btn-popup" onclick="window.open('/popup', '_blank')">Popup</button>
  <a id="btn-download" href="/download/test.pdf">Download</a>
</body>
</html>`);
          return;
        }

        if (url.pathname === "/apply/step2") {
          const cookieHeader = req.headers.cookie || "";
          const hasSessionCookie = cookieHeader.includes("ats_session=session_token_synth_12345");

          if (hasSessionCookie) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<!DOCTYPE html>
<html>
<head><title>Synthetic ATS Step 2 (Authenticated)</title></head>
<body>
  <h1>Step 2: Resume & Questions</h1>
  <div id="auth-status">authenticated</div>
</body>
</html>`);
          } else {
            res.writeHead(401, { "Content-Type": "text/html" });
            res.end(`<!DOCTYPE html>
<html>
<head><title>Unauthorized</title></head>
<body><h1>Error: Missing Session Cookie</h1></body>
</html>`);
          }
          return;
        }

        if (url.pathname === "/popup") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<!DOCTYPE html><html><head><title>Popup Page</title></head><body>Popup content</body></html>`);
          return;
        }

        if (url.pathname === "/download/test.pdf") {
          res.writeHead(200, {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="test.pdf"',
          });
          res.end("%PDF-1.4 synthetic pdf content");
          return;
        }

        if (url.pathname === "/hostile") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Hostile Page</title></head>
<body>
  <h1>Hostile Fixture Testing Isolation</h1>
  <script>
    window.__hostileAudit = {
      hasRequire: typeof window.require !== "undefined",
      hasProcess: typeof window.process !== "undefined",
      hasJobEngineDesktop: typeof window.jobEngineDesktop !== "undefined",
      hasElectron: typeof window.electron !== "undefined",
      hasIpcRenderer: typeof window.ipcRenderer !== "undefined",
    };
  </script>
</body>
</html>`);
          return;
        }

        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("Not Found");
      }
    );
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address() as any;
        this.port = addr.port;
        this.baseUrl = `https://127.0.0.1:${this.port}`;
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

export class MockWebRendererServer {
  private server: http.Server;
  public port: number = 0;
  public origin: string = "";

  constructor() {
    this.server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Job Engine Next.js Web App</title></head>
<body>
  <div id="root">Next.js Renderer Mounted</div>
</body>
</html>`);
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address() as any;
        this.port = addr.port;
        this.origin = `http://127.0.0.1:${this.port}`;
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
