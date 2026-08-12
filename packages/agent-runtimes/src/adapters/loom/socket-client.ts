// Headless NDJSON socket client for the loom control API.
//
// loom (vendored under apps/desktop/engines/loom, Apache-2.0) is the protocol
// author; this client speaks its newline-delimited JSON Unix-socket wire so
// Recoder can drive the engine as an execution substrate. See
// docs/LOOM-INTEGRATION.md.
//
// Contract (mirrors the plan's framing landmines):
//   - Connect to `loom.sock`. `loom-client.sock` is a SEPARATE private TUI
//     render wire — connecting there yields garbage; never point this client at
//     it.
//   - Each request opens a connection, writes `JSON.stringify(req) + "\n"`, then
//     LINE-BUFFERS incoming bytes (a single reply can span multiple socket
//     reads; a naive one-read client truncates).
//   - Discriminate each line: `result` -> resolve; `error` -> reject with a
//     LoomError carrying code + message. A malformed or partial line is
//     surfaced truthfully — the client never fabricates a result.
//   - The socket path is INJECTED via the constructor and is never read from
//     `process.env` inside this module (config-injection rule, mirroring the
//     tmux adapter). Use `defaultLoomSocketPath(env)` at the composition edge.

import { createConnection, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  LOOM_PROTOCOL_VERSION,
  isLoomErrorResponse,
  isLoomSubscriptionEvent,
  isLoomSuccessResponse,
  parseAgentQueryResult,
  type AgentInfo,
  type AgentQueryParams,
  type LoomMethod,
  type LoomRequest,
  type LoomResult,
  type LoomSubscriptionEvent,
  type EventsSubscribeParams,
  type PongResult,
} from './protocol';

/** Default single-shot read timeout (ms). */
const DEFAULT_CALL_TIMEOUT_MS = 10_000;

/**
 * Default blocking-wait read timeout (ms). Matches loom's max agent timeout so
 * `agent.wait` / `agent.prompt{wait}` can hold the socket for a full run.
 */
const DEFAULT_WAIT_TIMEOUT_MS = 300_000;

/** Canonical socket filename. `loom-client.sock` is the wrong (TUI) wire. */
export const LOOM_SOCKET_FILENAME = 'loom.sock';

/**
 * A protocol- or transport-level failure. `code` echoes loom's `error.code`
 * when the server rejected, or a client-side sentinel (`timeout`,
 * `connection_closed`, `malformed_response`, `protocol_mismatch`, ...).
 */
export class LoomError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LoomError';
    this.code = code;
  }
}

export interface LoomSocketClientOptions {
  /** Absolute path to the loom `loom.sock` Unix socket (injected, never env). */
  socketPath: string;
  /** Override the single-shot `call` timeout. */
  callTimeoutMs?: number;
  /** Override the blocking-wait `callAndWait` timeout. */
  waitTimeoutMs?: number;
}

export interface LoomCallOptions {
  timeoutMs?: number;
}

export interface LoomSubscribeOptions {
  /**
   * Close the stream if no event (and no `subscription_started`) arrives within
   * this window. Omit to stream until the caller closes.
   */
  idleTimeoutMs?: number;
}

/** An open subscription: an async iterator of bare `{event, data}` lines. */
export interface LoomEventStream extends AsyncIterable<LoomSubscriptionEvent> {
  /** Stop the stream and close the underlying socket. */
  close(): void;
}

/**
 * Reassembles newline-delimited lines from arbitrarily-chunked socket reads.
 * Persisting `buffer` across `push` calls is what makes a reply that spans
 * multiple reads reassemble into one message.
 */
class LineBuffer {
  private buffer = '';

  push(chunk: Buffer | string): string[] {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const lines: string[] = [];
    let index = this.buffer.indexOf('\n');
    while (index !== -1) {
      lines.push(this.buffer.slice(0, index));
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf('\n');
    }
    return lines;
  }
}

export class LoomSocketClient {
  private readonly socketPath: string;
  private readonly callTimeoutMs: number;
  private readonly waitTimeoutMs: number;
  private requestCounter = 0;

  constructor(options: LoomSocketClientOptions) {
    if (options.socketPath == null || options.socketPath.length === 0) {
      throw new LoomError(
        'invalid_socket_path',
        'loom socketPath must be a non-empty path'
      );
    }
    this.socketPath = options.socketPath;
    this.callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    this.waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  }

  /**
   * Single-shot: open, send, take the FIRST reply line, then close. Use for the
   * fast request/response methods (`ping`, `agent.get`, `worktree.create`, ...).
   */
  call<Result extends LoomResult = LoomResult>(
    method: LoomMethod,
    params: unknown,
    options?: LoomCallOptions
  ): Promise<Result> {
    return this.requestOneLine<Result>(
      method,
      params,
      options?.timeoutMs ?? this.callTimeoutMs
    );
  }

  /**
   * Blocking-wait: same one-line semantics as `call`, but with a long read
   * timeout for methods that hold the socket until they settle
   * (`agent.prompt{wait}`, `agent.wait`, `events.wait`).
   */
  callAndWait<Result extends LoomResult = LoomResult>(
    method: LoomMethod,
    params: unknown,
    options?: LoomCallOptions
  ): Promise<Result> {
    return this.requestOneLine<Result>(
      method,
      params,
      options?.timeoutMs ?? this.waitTimeoutMs
    );
  }

  /**
   * Connect + handshake guard. Rejects unless the server answers `pong` with the
   * expected `protocol` (20). Callers should run this before issuing any other
   * method.
   */
  async ping(options?: LoomCallOptions): Promise<PongResult> {
    const result = await this.call<LoomResult>('ping', {}, options);
    if (result.type !== 'pong') {
      throw new LoomError(
        'unexpected_response',
        `loom ping returned '${result.type}', expected 'pong'`
      );
    }
    const pong = result as PongResult;
    if (pong.protocol !== LOOM_PROTOCOL_VERSION) {
      throw new LoomError(
        'protocol_mismatch',
        `loom protocol ${pong.protocol} does not match required ${LOOM_PROTOCOL_VERSION}`
      );
    }
    return pong;
  }

  /**
   * `agent.query`: a single-shot, server-side filtered + sorted agent read.
   * Sends the filter/sort/limit spec and returns the matching {@link AgentInfo}
   * list in the requested order — one round trip instead of N per-pane
   * `agent.get` calls. The reply is parsed defensively: an unexpected or
   * malformed result surfaces as an empty list rather than a fabricated agent
   * (a transport/error line still rejects with a {@link LoomError}).
   */
  async agentQuery(
    params: AgentQueryParams,
    options?: LoomCallOptions
  ): Promise<AgentInfo[]> {
    const result = await this.call<LoomResult>('agent.query', params, options);
    return parseAgentQueryResult(result);
  }

  /**
   * Stream mode: `events.subscribe` emits an initial `subscription_started`
   * result, then bare `{event, data}` lines until the caller closes. The
   * returned async iterator yields only the bare event lines.
   */
  subscribe(
    params: EventsSubscribeParams,
    options?: LoomSubscribeOptions
  ): LoomEventStream {
    const socket = createConnection(this.socketPath);
    const request: LoomRequest<EventsSubscribeParams> = {
      id: this.nextId(),
      method: 'events.subscribe',
      params,
    };
    const lineBuffer = new LineBuffer();
    const queued: LoomSubscriptionEvent[] = [];

    let resolveNext:
      ((result: IteratorResult<LoomSubscriptionEvent>) => void) | null = null;
    let rejectNext: ((reason: unknown) => void) | null = null;
    let failure: unknown = null;
    let finished = false;
    let acknowledged = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const clearIdle = (): void => {
      if (idleTimer != null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const settle = (reason?: unknown): void => {
      if (finished) return;
      finished = true;
      clearIdle();
      if (reason != null) failure = reason;
      socket.destroy();
      if (reason != null && rejectNext != null) {
        const reject = rejectNext;
        resolveNext = null;
        rejectNext = null;
        reject(reason);
      } else if (resolveNext != null) {
        const resolve = resolveNext;
        resolveNext = null;
        rejectNext = null;
        resolve({ value: undefined, done: true });
      }
    };

    const armIdle = (): void => {
      if (options?.idleTimeoutMs == null) return;
      clearIdle();
      idleTimer = setTimeout(() => settle(), options.idleTimeoutMs);
    };

    const emit = (event: LoomSubscriptionEvent): void => {
      armIdle();
      if (resolveNext != null) {
        const resolve = resolveNext;
        resolveNext = null;
        rejectNext = null;
        resolve({ value: event, done: false });
      } else {
        queued.push(event);
      }
    };

    socket.on('connect', () => {
      armIdle();
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on('error', err => settle(err));
    socket.on('close', () =>
      settle(
        finished
          ? undefined
          : new LoomError(
              'connection_closed',
              'loom subscription socket closed'
            )
      )
    );
    socket.on('data', chunk => {
      for (const line of lineBuffer.push(chunk)) {
        if (line.trim().length === 0) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          settle(
            new LoomError(
              'malformed_event',
              'loom subscription emitted a non-JSON line'
            )
          );
          return;
        }

        if (isLoomErrorResponse(parsed)) {
          settle(new LoomError(parsed.error.code, parsed.error.message));
          return;
        }

        if (!acknowledged) {
          if (
            isLoomSuccessResponse(parsed) &&
            parsed.result.type === 'subscription_started'
          ) {
            acknowledged = true;
            armIdle();
            continue;
          }
          settle(
            new LoomError(
              'unexpected_response',
              'loom subscription did not open with subscription_started'
            )
          );
          return;
        }

        if (isLoomSubscriptionEvent(parsed)) {
          emit(parsed);
          continue;
        }

        settle(
          new LoomError(
            'unexpected_event',
            'loom subscription emitted a non-event line'
          )
        );
        return;
      }
    });

    const iterator: AsyncIterator<LoomSubscriptionEvent> = {
      next: () => {
        if (queued.length > 0) {
          return Promise.resolve({
            value: queued.shift() as LoomSubscriptionEvent,
            done: false,
          });
        }
        if (failure != null) return Promise.reject(failure);
        if (finished) return Promise.resolve({ value: undefined, done: true });
        return new Promise<IteratorResult<LoomSubscriptionEvent>>(
          (resolve, reject) => {
            resolveNext = resolve;
            rejectNext = reject;
          }
        );
      },
      return: () => {
        settle();
        return Promise.resolve({ value: undefined, done: true });
      },
    };

    return {
      [Symbol.asyncIterator]: () => iterator,
      close: () => settle(),
    };
  }

  private requestOneLine<Result extends LoomResult>(
    method: LoomMethod,
    params: unknown,
    timeoutMs: number
  ): Promise<Result> {
    const request: LoomRequest = {
      id: this.nextId(),
      method,
      params: params as Record<string, unknown>,
    };

    return new Promise<Result>((resolve, reject) => {
      const socket: Socket = createConnection(this.socketPath);
      const lineBuffer = new LineBuffer();
      let settled = false;

      const finish = (run: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        run();
      };

      const timer = setTimeout(() => {
        finish(() =>
          reject(
            new LoomError(
              'timeout',
              `loom ${method} timed out after ${timeoutMs}ms`
            )
          )
        );
      }, timeoutMs);

      socket.on('connect', () => {
        // Node flushes queued writes automatically; no explicit flush verb.
        socket.write(`${JSON.stringify(request)}\n`);
      });
      socket.on('error', err => finish(() => reject(err)));
      socket.on('close', () =>
        finish(() =>
          reject(
            new LoomError(
              'connection_closed',
              `loom ${method} socket closed before a reply`
            )
          )
        )
      );
      socket.on('data', chunk => {
        const lines = lineBuffer.push(chunk);
        if (lines.length === 0) return;

        const first = lines[0];
        let parsed: unknown;
        try {
          parsed = JSON.parse(first);
        } catch {
          finish(() =>
            reject(
              new LoomError(
                'malformed_response',
                `loom ${method} returned a non-JSON line`
              )
            )
          );
          return;
        }

        if (isLoomErrorResponse(parsed)) {
          finish(() =>
            reject(new LoomError(parsed.error.code, parsed.error.message))
          );
          return;
        }
        if (isLoomSuccessResponse(parsed)) {
          finish(() => resolve(parsed.result as Result));
          return;
        }
        finish(() =>
          reject(
            new LoomError(
              'unexpected_response',
              `loom ${method} returned an unrecognized line`
            )
          )
        );
      });
    });
  }

  private nextId(): string {
    this.requestCounter += 1;
    return `recoder-${this.requestCounter}-${Math.random().toString(16).slice(2)}`;
  }
}

/**
 * Resolve the loom socket path from the environment for use at the composition
 * edge (the client itself never reads env). Prefers `LOOM_SOCKET_PATH`, else
 * `${XDG_CONFIG_HOME:-~/.config}/loom/loom.sock`.
 */
export function defaultLoomSocketPath(
  env: NodeJS.ProcessEnv = process.env
): string {
  const explicit = env.LOOM_SOCKET_PATH;
  if (explicit != null && explicit.length > 0) return explicit;
  const xdgConfigHome = env.XDG_CONFIG_HOME;
  const configRoot =
    xdgConfigHome != null && xdgConfigHome.length > 0
      ? xdgConfigHome
      : join(homedir(), '.config');
  return join(configRoot, 'loom', LOOM_SOCKET_FILENAME);
}
