import * as net from 'node:net';

import { DaemonUnavailableError } from '../errors';
import { encodeFrame, FrameDecoder, FrameError } from './codec';
import {
  type IpcMethod,
  type IpcResponseEnvelope,
  makeRequestEnvelope,
  parseResponseEnvelope,
} from './envelope';

/**
 * GovernanceDaemonClient — a hostile-by-default UDS client for the owned Rust
 * governance daemon.
 *
 * Transport: a single `node:net` Unix-domain-socket connection carrying
 * length-prefixed JSON frames (see `codec.ts`). Each call mints a correlation
 * id, frames a request envelope, awaits the matching response within a timeout,
 * and validates the decoded reply against the pinned envelope contract.
 *
 * FAIL-CLOSED CONTRACT: every failure mode — no socket, connect error, write
 * error, timeout, malformed/oversized frame, unknown method echoed, id
 * mismatch, or a daemon-reported error — surfaces as a `DaemonUnavailableError`.
 * The facade catches that and falls back to the pure-TS deny-biased path. The
 * client NEVER fabricates a success.
 *
 * No external dependency: `node:net` + JSON only.
 */

export type GovernanceDaemonClientOptions = {
  /** UDS path. Typically from `process.env.GOVERNANCE_SOCKET`. */
  readonly socketPath: string;
  /** Per-request timeout in ms (connect + round-trip). */
  readonly requestTimeoutMs?: number;
  /** Max reconnect attempts within a single call before giving up. */
  readonly maxConnectRetries?: number;
  /** Base backoff in ms (exponential, capped). */
  readonly backoffBaseMs?: number;
  /** Backoff ceiling in ms. */
  readonly backoffMaxMs?: number;
};

type Pending = {
  readonly method: IpcMethod;
  resolve: (value: IpcResponseEnvelope) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

const DEFAULTS = {
  requestTimeoutMs: 2_000,
  maxConnectRetries: 2,
  backoffBaseMs: 25,
  backoffMaxMs: 250,
};

export class GovernanceDaemonClient {
  private readonly socketPath: string;
  private readonly requestTimeoutMs: number;
  private readonly maxConnectRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  private socket: net.Socket | null = null;
  private connecting: Promise<net.Socket> | null = null;
  private readonly decoder = new FrameDecoder();
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private closed = false;

  constructor(options: GovernanceDaemonClientOptions) {
    if (typeof options.socketPath !== 'string' || options.socketPath.length === 0) {
      throw new DaemonUnavailableError('GovernanceDaemonClient: socketPath is required');
    }
    this.socketPath = options.socketPath;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs;
    this.maxConnectRetries = options.maxConnectRetries ?? DEFAULTS.maxConnectRetries;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULTS.backoffBaseMs;
    this.backoffMaxMs = options.backoffMaxMs ?? DEFAULTS.backoffMaxMs;
  }

  // ---- public method surface ------------------------------------------------

  decide(params: unknown): Promise<unknown> {
    return this.call('decide', params);
  }

  enforceTool(params: unknown): Promise<unknown> {
    return this.call('enforceTool', params);
  }

  route(params: unknown): Promise<unknown> {
    return this.call('route', params);
  }

  recordAudit(params: unknown): Promise<unknown> {
    return this.call('recordAudit', params);
  }

  verifyAudit(params: unknown): Promise<unknown> {
    return this.call('verifyAudit', params);
  }

  health(params: unknown = {}): Promise<unknown> {
    return this.call('health', params);
  }

  /** Close the connection and reject any in-flight calls. Idempotent. */
  close(): void {
    this.closed = true;
    const sock = this.socket;
    this.socket = null;
    this.connecting = null;
    if (sock) {
      sock.removeAllListeners();
      sock.destroy();
    }
    const failure = new DaemonUnavailableError('GovernanceDaemonClient: client closed');
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(failure);
      this.pending.delete(id);
    }
    this.decoder.reset();
  }

  // ---- core call ------------------------------------------------------------

  /**
   * Issue one validated round-trip. Resolves with the `result` payload on a
   * daemon `ok: true`; throws `DaemonUnavailableError` on EVERY other path.
   */
  private async call(method: IpcMethod, params: unknown): Promise<unknown> {
    if (this.closed) {
      throw new DaemonUnavailableError('GovernanceDaemonClient: client is closed');
    }

    let socket: net.Socket;
    try {
      socket = await this.ensureConnected();
    } catch (err) {
      throw asDaemonUnavailable('connect failed', err);
    }

    const id = this.nextId++;
    const envelope = makeRequestEnvelope(id, method, params);

    let frame: Buffer;
    try {
      frame = encodeFrame(envelope);
    } catch (err) {
      throw asDaemonUnavailable('request encode failed', err);
    }

    const response = await new Promise<IpcResponseEnvelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // A timed-out request poisons the connection (the daemon may still be
        // mid-reply); drop it so the next call reconnects cleanly.
        this.dropSocket();
        reject(new DaemonUnavailableError(`GovernanceDaemonClient: '${method}' timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
      // Do not let the timer keep the event loop alive.
      if (typeof timer.unref === 'function') timer.unref();

      this.pending.set(id, { method, resolve, reject, timer });

      socket.write(frame, (writeErr) => {
        if (writeErr) {
          const p = this.pending.get(id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(id);
          }
          this.dropSocket();
          reject(asDaemonUnavailable('socket write failed', writeErr));
        }
      });
    });

    // Validate the correlation + method echo (hostile: never trust the wire).
    if (response.id !== id) {
      this.dropSocket();
      throw new DaemonUnavailableError(`GovernanceDaemonClient: response id ${response.id} != request id ${id}`);
    }
    if (response.method !== method) {
      this.dropSocket();
      throw new DaemonUnavailableError(`GovernanceDaemonClient: response method '${response.method}' != '${method}'`);
    }

    if (response.ok === true) {
      return response.result;
    }
    // Daemon-reported error -> treat as unavailable so the facade falls back.
    throw new DaemonUnavailableError(
      `GovernanceDaemonClient: daemon error for '${method}': [${response.error.code}] ${response.error.message}`,
      { daemonCode: response.error.code },
    );
  }

  // ---- connection lifecycle -------------------------------------------------

  private async ensureConnected(): Promise<net.Socket> {
    if (this.socket && !this.socket.destroyed) return this.socket;
    if (this.connecting) return this.connecting;

    this.connecting = this.connectWithBackoff().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connectWithBackoff(): Promise<net.Socket> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxConnectRetries; attempt++) {
      if (this.closed) throw new DaemonUnavailableError('GovernanceDaemonClient: client is closed');
      try {
        return await this.connectOnce();
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxConnectRetries) {
          await delay(this.backoffFor(attempt));
        }
      }
    }
    throw asDaemonUnavailable(`connect to '${this.socketPath}' failed`, lastErr);
  }

  private connectOnce(): Promise<net.Socket> {
    return new Promise<net.Socket>((resolve, reject) => {
      const socket = net.createConnection({ path: this.socketPath });
      let settled = false;

      const connectTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new DaemonUnavailableError('GovernanceDaemonClient: connect timed out'));
      }, this.requestTimeoutMs);
      if (typeof connectTimer.unref === 'function') connectTimer.unref();

      socket.once('connect', () => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        this.attachSocket(socket);
        resolve(socket);
      });

      socket.once('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        socket.destroy();
        reject(err);
      });
    });
  }

  /** Wire a live socket's data/close handlers and adopt it. */
  private attachSocket(socket: net.Socket): void {
    this.socket = socket;
    this.decoder.reset();
    if (typeof socket.unref === 'function') socket.unref();

    socket.on('data', (chunk: Buffer) => this.onData(chunk));
    socket.on('error', () => this.dropSocket());
    socket.on('close', () => this.dropSocket());
  }

  private onData(chunk: Buffer): void {
    let frames: unknown[];
    try {
      frames = this.decoder.push(chunk);
    } catch (err) {
      // A framing violation is hostile data -> poison the connection and fail
      // every in-flight call closed.
      this.failAllPending(asDaemonUnavailable('frame decode failed', err));
      this.dropSocket();
      return;
    }
    for (const raw of frames) {
      const response = parseResponseEnvelope(raw);
      if (response === null) {
        // Unknown/oversized/malformed envelope -> never trust it.
        this.failAllPending(new DaemonUnavailableError('GovernanceDaemonClient: malformed response envelope'));
        this.dropSocket();
        return;
      }
      const p = this.pending.get(response.id);
      if (!p) {
        // Unsolicited / duplicate response -> ignore (we never asked for it).
        continue;
      }
      clearTimeout(p.timer);
      this.pending.delete(response.id);
      p.resolve(response);
    }
  }

  /** Tear down the current socket without closing the client; calls reconnect. */
  private dropSocket(): void {
    const sock = this.socket;
    this.socket = null;
    this.decoder.reset();
    if (sock) {
      sock.removeAllListeners();
      sock.destroy();
    }
  }

  private failAllPending(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  private backoffFor(attempt: number): number {
    const exp = this.backoffBaseMs * 2 ** attempt;
    return Math.min(exp, this.backoffMaxMs);
  }
}

// ---- helpers ----------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === 'function') t.unref();
  });
}

/** Wrap any thrown value as a DaemonUnavailableError (idempotent for that type). */
function asDaemonUnavailable(context: string, err: unknown): DaemonUnavailableError {
  if (err instanceof DaemonUnavailableError) return err;
  const detail =
    err instanceof FrameError || err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error';
  return new DaemonUnavailableError(`GovernanceDaemonClient: ${context}: ${detail}`);
}
