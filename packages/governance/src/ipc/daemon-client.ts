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
 * id, frames a request envelope in the daemon's NATIVE wire (string id,
 * snake_case method, `payload` carrying params + the shared key), awaits the
 * matching response within a timeout, and validates the decoded reply against
 * the daemon's real envelope contract (`{ id, ok, result?, error? }`).
 *
 * NATIVE WIRE (no shim): the request/response shapes mirror the Rust daemon's
 * `serde` structs exactly (see `envelope.ts`). The public method surface is the
 * TS-camelCase names the facade calls; the wire method is the daemon's
 * snake_case form, mapped in `METHOD_WIRE`.
 *
 * FAIL-CLOSED CONTRACT: every failure mode — no socket, connect error, write
 * error, timeout, malformed/oversized frame, id mismatch, or a daemon-reported
 * error (`ok:false`) — surfaces as a `DaemonUnavailableError`. The facade
 * catches that and falls back to the pure-TS deny-biased path. The client NEVER
 * fabricates a success.
 *
 * No external dependency: `node:net` + JSON only.
 */

export type GovernanceDaemonClientOptions = {
  /** UDS path. Typically from `process.env.GOVERNANCE_SOCKET`. */
  readonly socketPath: string;
  /**
   * The shared `INTERNAL_SERVICE_KEY` injected at `payload.key` for the
   * authenticated methods. When omitted, the env var `INTERNAL_SERVICE_KEY` is
   * consulted; when neither is present no key is sent (the daemon then rejects
   * every non-`health` method, which the facade treats as fail-closed).
   */
  readonly serviceKey?: string;
  /** Per-request timeout in ms (connect + round-trip). */
  readonly requestTimeoutMs?: number;
  /** Max reconnect attempts within a single call before giving up. */
  readonly maxConnectRetries?: number;
  /** Base backoff in ms (exponential, capped). */
  readonly backoffBaseMs?: number;
  /** Backoff ceiling in ms. */
  readonly backoffMaxMs?: number;
};

/** TS-facing (camelCase) client method -> daemon snake_case wire method. */
const METHOD_WIRE = {
  decide: 'decide',
  enforceTool: 'enforce_tool',
  route: 'route',
  recordAudit: 'record_audit',
  verifyAudit: 'verify_audit',
  health: 'health',
} as const satisfies Record<string, IpcMethod>;

/** The TS-facing method names the client exposes. */
type ClientMethod = keyof typeof METHOD_WIRE;

type Pending = {
  readonly method: ClientMethod;
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
  private readonly serviceKey?: string;
  private readonly requestTimeoutMs: number;
  private readonly maxConnectRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  private socket: net.Socket | null = null;
  private connecting: Promise<net.Socket> | null = null;
  private readonly decoder = new FrameDecoder();
  private readonly pending = new Map<string, Pending>();
  private nextId = 1;
  private closed = false;

  constructor(options: GovernanceDaemonClientOptions) {
    if (typeof options.socketPath !== 'string' || options.socketPath.length === 0) {
      throw new DaemonUnavailableError('GovernanceDaemonClient: socketPath is required');
    }
    this.socketPath = options.socketPath;
    // Prefer an explicit key; otherwise read INTERNAL_SERVICE_KEY from the env
    // (the same secret the daemon loads). A blank key is treated as absent.
    const envKey = process.env.INTERNAL_SERVICE_KEY?.trim();
    const optKey = options.serviceKey?.trim();
    this.serviceKey = optKey && optKey.length > 0 ? optKey : envKey && envKey.length > 0 ? envKey : undefined;
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
  private async call(method: ClientMethod, params: unknown): Promise<unknown> {
    if (this.closed) {
      throw new DaemonUnavailableError('GovernanceDaemonClient: client is closed');
    }

    let socket: net.Socket;
    try {
      socket = await this.ensureConnected();
    } catch (err) {
      throw asDaemonUnavailable('connect failed', err);
    }

    // A monotonic, per-process-unique STRING id (the daemon echoes it back). A
    // counter is deterministic and collision-free within a client instance;
    // bounded well under the daemon's MAX_ID_LEN.
    const id = `gov-${this.nextId++}`;
    const wireMethod = METHOD_WIRE[method];
    const payload = this.buildPayload(wireMethod, params);
    const envelope = makeRequestEnvelope(id, wireMethod, payload, Date.now());

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

    // Validate the correlation echo (hostile: never trust the wire). The daemon
    // does not echo the method, so the id is the sole correlation field.
    if (response.id !== id) {
      this.dropSocket();
      throw new DaemonUnavailableError(`GovernanceDaemonClient: response id '${response.id}' != request id '${id}'`);
    }

    if (response.ok === true) {
      return response.result;
    }
    // Daemon-reported error (a string) -> treat as unavailable so the facade
    // falls back.
    throw new DaemonUnavailableError(
      `GovernanceDaemonClient: daemon error for '${method}': ${response.error}`,
    );
  }

  /**
   * Build the method payload in the daemon's native shape: the caller's params
   * as the base object, with the shared `key` injected for the authenticated
   * methods. `health` needs no key (the daemon serves it unauthenticated), but
   * injecting it is harmless and matches the INTERNAL_SERVICE_KEY contract.
   */
  private buildPayload(wireMethod: IpcMethod, params: unknown): Record<string, unknown> {
    const base: Record<string, unknown> =
      typeof params === 'object' && params !== null ? { ...(params as Record<string, unknown>) } : {};
    if (this.serviceKey !== undefined) {
      base.key = this.serviceKey;
    }
    return base;
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
