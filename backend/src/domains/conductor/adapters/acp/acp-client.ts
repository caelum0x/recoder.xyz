/**
 * AcpClient — the JSON-RPC correlation + routing layer over the {@link acp-codec}.
 * It sits between the raw agent-process stdio (owned by the driver) and the
 * conductor: the driver injects a `send` sink and pumps stdout bytes through
 * `feed`; this client
 *
 *   - assigns request ids and resolves the returned promise when the matching
 *     response arrives (`request`);
 *   - sends fire-and-forget notifications (`notify`);
 *   - routes AGENT-INITIATED calls (`session/request_permission`, `fs/read_text_file`,
 *     `terminal/*`) to an injected `onRequest` handler and writes back its result
 *     (or a JSON-RPC error) — this is where ACP replaces the tmux input-wait
 *     heuristics: the agent ASKS, and the handler bridges to the approval gate;
 *   - forwards notifications (`session/update` streaming) to `onNotification`.
 *
 * PURE of process/stream concerns — the transport is injected, so it is fully
 * unit-testable with a fake `send`. Degrade-truthful: a response for an unknown
 * id is ignored (a late/dup), and a handler that throws becomes a truthful
 * JSON-RPC error back to the agent, never an unhandled rejection.
 */
import {
  AcpErrorCode,
  decodeAcpStream,
  encodeAcpMessage,
  isAcpNotification,
  isAcpRequest,
  isAcpResponse,
  makeError,
  makeRequest,
  makeNotification,
  makeResponse,
  type AcpNotification,
  type AcpRequest,
} from './acp-codec.js';

export interface AcpClientDeps {
  /** Write one framed line to the agent's stdin. */
  readonly send: (line: string) => void;
  /** Handle an agent-initiated request (permission/fs/terminal); its return is the result. */
  readonly onRequest?: (req: AcpRequest) => Promise<unknown> | unknown;
  /** Handle an agent notification (e.g. session/update stream chunks). */
  readonly onNotification?: (note: AcpNotification) => void;
  /** Best-effort warn sink for malformed traffic. */
  readonly warn?: (message: string, meta?: unknown) => void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export class AcpClient {
  private readonly deps: AcpClientDeps;
  private nextId = 1;
  private buffer = '';
  private readonly pending = new Map<number | string, Pending>();

  constructor(deps: AcpClientDeps) {
    this.deps = deps;
  }

  /** Send a request and resolve with its `result` (rejects on a JSON-RPC error). */
  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.deps.send(encodeAcpMessage(makeRequest(id, method, params)));
    });
  }

  /** Send a one-way notification (no response expected). */
  notify(method: string, params?: unknown): void {
    this.deps.send(encodeAcpMessage(makeNotification(method, params)));
  }

  /** Feed a raw stdout chunk; routes every complete message it contains. */
  feed(chunk: string): void {
    const { messages, rest } = decodeAcpStream(this.buffer + chunk);
    this.buffer = rest;
    for (const msg of messages) {
      if (isAcpResponse(msg)) {
        this.resolvePending(msg.id, 'result' in msg ? msg.result : undefined, msg.error);
      } else if (isAcpRequest(msg)) {
        void this.dispatchRequest(msg);
      } else if (isAcpNotification(msg)) {
        this.deps.onNotification?.(msg);
      }
    }
  }

  /** Reject every in-flight request — called by the driver when the process dies. */
  rejectAll(reason: string): void {
    for (const [, p] of this.pending) {
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private resolvePending(id: number | string, result: unknown, error?: { code: number; message: string }): void {
    const p = this.pending.get(id);
    if (!p) {
      // A response for an unknown id (late/dup) — ignore, never throw.
      this.deps.warn?.('acp: response for unknown id', { id });
      return;
    }
    this.pending.delete(id);
    if (error) {
      p.reject(new Error(`acp error ${error.code}: ${error.message}`));
    } else {
      p.resolve(result);
    }
  }

  private async dispatchRequest(req: AcpRequest): Promise<void> {
    if (!this.deps.onRequest) {
      this.deps.send(encodeAcpMessage(makeError(req.id, AcpErrorCode.MethodNotFound, `unhandled: ${req.method}`)));
      return;
    }
    try {
      const result = await this.deps.onRequest(req);
      this.deps.send(encodeAcpMessage(makeResponse(req.id, result ?? null)));
    } catch (err) {
      // Preserve a public JSON-RPC code carried by the handler's error
      // (MethodNotFound / InvalidParams); only synthesize InternalError when
      // the thrown value has no numeric code. Duck-typed to keep this file
      // disjoint from the request handler's error class.
      const code = typeof (err as { code?: unknown })?.code === 'number'
        ? (err as { code: number }).code
        : AcpErrorCode.InternalError;
      const message = err instanceof Error ? err.message : 'handler failed';
      this.deps.send(encodeAcpMessage(makeError(req.id, code, message)));
    }
  }
}
