/**
 * AcpAgentDriver — orchestrates one ACP agent process through the {@link AcpClient}.
 * It owns the lifecycle (initialize → session/new → session/prompt → cancel/stop)
 * and wires the process stdio to the client: stdout → `client.feed`, `client.send`
 * → stdin, process exit → `client.rejectAll`.
 *
 * The PROCESS is injected as an {@link AcpProcess} seam, so the orchestration is
 * unit-testable with a fake in-memory process — the real adapter's only job is to
 * spawn the agent binary (claude-code-acp / codex-acp) and adapt its child_process
 * streams to this seam. Degrade-truthful: `start` is idempotent-guarded, a prompt
 * after the process died rejects truthfully (via rejectAll), and `stop` always
 * kills + fails in-flight requests.
 */
import { AcpClient } from './acp-client.js';
import type { AcpNotification, AcpRequest } from './acp-codec.js';

/** The minimal child-process surface the driver needs (real impl wraps child_process). */
export interface AcpProcess {
  /** Write framed bytes to the agent's stdin. */
  write(data: string): void;
  /** Subscribe to stdout chunks (utf8). */
  onData(cb: (chunk: string) => void): void;
  /** Subscribe to process exit. */
  onExit(cb: (code: number | null) => void): void;
  /** Terminate the process. */
  kill(): void;
}

/** ACP protocol version this client negotiates. */
export const ACP_PROTOCOL_VERSION = 1;

export interface AcpDriverDeps {
  /** Spawn the agent process (real impl: child_process; tests: a fake). */
  readonly spawn: () => AcpProcess;
  /** Bridge an agent-initiated request (permission/fs/terminal) — e.g. to the approval gate. */
  readonly onRequest?: (req: AcpRequest) => Promise<unknown> | unknown;
  /** Bridge an agent notification (session/update streaming) — e.g. to the workspace tail. */
  readonly onNotification?: (note: AcpNotification) => void;
  readonly warn?: (message: string, meta?: unknown) => void;
}

export class AcpAgentDriver {
  private readonly deps: AcpDriverDeps;
  private client: AcpClient | null = null;
  private proc: AcpProcess | null = null;
  private exited = false;

  constructor(deps: AcpDriverDeps) {
    this.deps = deps;
  }

  /** Spawn the process, wire stdio, and complete the ACP `initialize` handshake. */
  async start(): Promise<{ protocolVersion: number }> {
    if (this.proc) {
      throw new Error('acp driver already started');
    }
    const proc = this.deps.spawn();
    const client = new AcpClient({
      send: (line) => proc.write(line),
      ...(this.deps.onRequest ? { onRequest: this.deps.onRequest } : {}),
      ...(this.deps.onNotification ? { onNotification: this.deps.onNotification } : {}),
      ...(this.deps.warn ? { warn: this.deps.warn } : {}),
    });
    proc.onData((chunk) => client.feed(chunk));
    proc.onExit(() => {
      this.exited = true;
      client.rejectAll('acp agent process exited');
    });
    this.proc = proc;
    this.client = client;
    const result = (await client.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    })) as { protocolVersion?: number } | null;
    return { protocolVersion: result?.protocolVersion ?? ACP_PROTOCOL_VERSION };
  }

  /** Open a new session rooted at `cwd`; returns the agent's sessionId. */
  async newSession(cwd: string): Promise<string> {
    const result = (await this.activeClient().request('session/new', { cwd, mcpServers: [] })) as {
      sessionId?: string;
    } | null;
    const sessionId = result?.sessionId;
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new Error('acp session/new returned no sessionId');
    }
    return sessionId;
  }

  /** Send a user turn; resolves with the agent's stop reason when the turn ends. */
  async prompt(sessionId: string, text: string): Promise<string> {
    const result = (await this.activeClient().request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text }],
    })) as { stopReason?: string } | null;
    return result?.stopReason ?? 'end_turn';
  }

  /** Cancel the in-flight turn (a notification — the agent ends the turn itself). */
  cancel(sessionId: string): void {
    this.activeClient().notify('session/cancel', { sessionId });
  }

  /** Kill the process and fail any in-flight requests. Idempotent. */
  stop(): void {
    if (this.proc && !this.exited) {
      this.proc.kill();
    }
    this.client?.rejectAll('acp driver stopped');
    this.proc = null;
    this.client = null;
  }

  private activeClient(): AcpClient {
    if (this.client == null || this.proc == null || this.exited) {
      throw new Error('acp driver not started');
    }
    return this.client;
  }
}
