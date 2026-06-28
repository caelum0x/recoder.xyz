import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import type { ExternalMcpServerConfig } from "./external-server-config";

/**
 * A real stdio JSON-RPC client that SUPERVISES an external MCP server process.
 *
 * This is the genuine wire to a process like `py/pal-mcp-server`: spawn the
 * executable, speak newline-delimited JSON-RPC 2.0 over stdin/stdout, and drain
 * stderr to a diagnostics buffer (never to the protocol stream). It is NOT a
 * REST wrapper — it is the MCP stdio transport, the same protocol the Python
 * server implements.
 *
 * Degrade-safe by construction: if the executable does not exist, the client
 * reports `unavailable` truthfully and every call rejects — it never fakes a
 * started process or a successful response.
 *
 * This is an IO adapter (impure). The pure host/policy layers depend on the
 * `StdioMcpTransport` port type, not on this class directly.
 */

/** A pending JSON-RPC request awaiting its matched response. */
interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

/** The lifecycle state of a supervised process. */
export type StdioServerState =
  | "stopped"
  | "starting"
  | "ready"
  | "unavailable"
  | "errored";

/** The minimal transport contract the host depends on (the port). */
export interface StdioMcpTransport {
  start(): Promise<void>;
  call(method: string, params: unknown): Promise<unknown>;
  stop(): void;
  readonly state: StdioServerState;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_STDERR_BUFFER = 16_384;

export class StdioMcpClient implements StdioMcpTransport {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private _state: StdioServerState = "stopped";
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private stdoutBuffer = "";
  private stderrTail = "";
  private startError?: string;

  constructor(private readonly config: ExternalMcpServerConfig) {}

  get state(): StdioServerState {
    return this._state;
  }

  /** The most recent stderr (bounded) — surfaced in health, never trusted as protocol. */
  get diagnostics(): string {
    return this.stderrTail;
  }

  get lastStartError(): string | undefined {
    return this.startError;
  }

  /**
   * Start the process. If the executable is absent, this resolves into the
   * `unavailable` state (truthful) rather than throwing or faking readiness.
   */
  async start(): Promise<void> {
    if (this._state === "ready" || this._state === "starting") return;

    if (!existsSync(this.config.command)) {
      this._state = "unavailable";
      this.startError = `Executable not found: ${this.config.command}`;
      return;
    }

    this._state = "starting";
    try {
      this.proc = spawn(this.config.command, [...this.config.args], {
        cwd: this.config.cwd,
        env: { ...process.env, ...this.config.env },
        stdio: ["pipe", "pipe", "pipe"],
      }) as ChildProcessWithoutNullStreams;
    } catch (error) {
      this._state = "unavailable";
      this.startError = error instanceof Error ? error.message : String(error);
      return;
    }

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk: string) => this.onStderr(chunk));
    this.proc.on("error", (error) => this.onProcessError(error));
    this.proc.on("exit", (code) => this.onExit(code));

    // Probe readiness with the MCP `initialize` handshake, bounded by timeout.
    try {
      await this.callWithTimeout("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "@recoder/interop", version: "0.1.0" },
      }, this.config.startupTimeoutMs);
      this._state = "ready";
    } catch (error) {
      this.startError = error instanceof Error ? error.message : String(error);
      this._state = "errored";
      this.stop();
    }
  }

  /** Issue a JSON-RPC call. Rejects if the process is not ready. */
  call(method: string, params: unknown): Promise<unknown> {
    return this.callWithTimeout(method, params, DEFAULT_REQUEST_TIMEOUT_MS);
  }

  private callWithTimeout(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    if (!this.proc || (this._state !== "ready" && this._state !== "starting")) {
      return Promise.reject(
        new Error(`External MCP server '${this.config.serverId}' is ${this._state}.`),
      );
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.proc?.stdin.write(payload);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  stop(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(`External MCP server '${this.config.serverId}' stopped.`));
    }
    this.pending.clear();
    if (this.proc) {
      this.proc.removeAllListeners();
      try {
        this.proc.kill("SIGTERM");
      } catch {
        // best-effort
      }
      this.proc = null;
    }
    if (this._state !== "unavailable") {
      this._state = "stopped";
    }
  }

  /** Parse newline-delimited JSON-RPC frames from stdout and resolve pendings. */
  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        this.dispatchFrame(line);
      }
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private dispatchFrame(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      // A non-JSON line on stdout is not protocol; ignore it (server noise).
      return;
    }
    if (
      typeof message !== "object" ||
      message === null ||
      !("id" in message) ||
      typeof (message as { id: unknown }).id !== "number"
    ) {
      return;
    }
    const id = (message as { id: number }).id;
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    const err = (message as { error?: { message?: string } }).error;
    if (err) {
      pending.reject(new Error(err.message ?? "MCP server returned an error."));
    } else {
      pending.resolve((message as { result?: unknown }).result);
    }
  }

  private onStderr(chunk: string): void {
    this.stderrTail = (this.stderrTail + chunk).slice(-MAX_STDERR_BUFFER);
  }

  private onProcessError(error: Error): void {
    this.startError = error.message;
    this._state = "errored";
  }

  private onExit(code: number | null): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(`External MCP server exited (code ${code ?? "null"}).`));
    }
    this.pending.clear();
    this.proc = null;
    if (this._state !== "unavailable") {
      this._state = "stopped";
    }
  }
}
