/**
 * `a2a-jsonrpc-server` — the A2A standard JSON-RPC 2.0 method surface
 * (`message/send`, `tasks/get`, `tasks/cancel`, `tasks/resubscribe`). The wire
 * group registers each method's handler (routing into task-lifecycle + dispatch,
 * built by later Phase-7a groups); this server owns the dispatch, validation, and
 * spec-correct error mapping.
 *
 * Fail-closed: an invalid request shape ⇒ `-32600`; an unknown / not-yet-wired
 * method ⇒ `-32601`; a registered handler that throws ⇒ `-32000` (or a mapped
 * `RpcError` code) — NEVER a fabricated `result`.
 */

/** The canonical A2A JSON-RPC methods this instance advertises. */
export const A2A_METHODS = {
  MESSAGE_SEND: 'message/send',
  TASKS_GET: 'tasks/get',
  TASKS_CANCEL: 'tasks/cancel',
  TASKS_RESUBSCRIBE: 'tasks/resubscribe',
} as const;

export type A2AMethod = (typeof A2A_METHODS)[keyof typeof A2A_METHODS];

/** A minimal JSON-RPC 2.0 request. */
export interface JsonRpcRequest<TParams = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly method: string;
  readonly params?: TParams;
}

/** A minimal JSON-RPC 2.0 response (success xor error). */
export interface JsonRpcResponse<TResult = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly result?: TResult;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

/**
 * A handler-thrown error carrying an explicit JSON-RPC code (e.g. a task-not-found
 * mapped to a domain code). A plain `Error` maps to the generic `-32000`.
 */
export class RpcError extends Error {
  constructor(
    readonly rpcCode: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

/**
 * The verified caller identity carried OUT of signed-ingress admission into the
 * handlers. `signer` is present only when the request arrived as a valid ed25519
 * signed envelope; its `keyId` is the cryptographically-proven sender (the
 * registered agent id) and is the ONLY trustworthy owner identity — the envelope
 * `from` and any `params.userId` are attacker-choosable by an enrolled peer. When
 * `signer` is absent (insecure-dev / solo posture) handlers fall back to the
 * caller-supplied id (single-tenant fail-open).
 */
export interface A2ACallContext {
  readonly signer?: { readonly keyId: string; readonly from?: string };
}

/** A single method implementation the wire group registers. */
export type A2AMethodHandler = (req: JsonRpcRequest, ctx: A2ACallContext) => Promise<unknown> | unknown;

/** The dispatcher surface `routes/interop.routes.ts` mounts at `POST /api/a2a/rpc`. */
export interface A2AJsonRpcServer {
  register(method: A2AMethod | string, handler: A2AMethodHandler): void;
  /** The methods currently wired (advertised in the agent-card / capabilities). */
  methods(): readonly string[];
  handleA2ARpc(req: unknown, ctx?: A2ACallContext): Promise<JsonRpcResponse>;
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function isRequest(raw: unknown): raw is JsonRpcRequest {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return r.jsonrpc === '2.0' && typeof r.method === 'string';
}

/** Build the JSON-RPC server. Pure factory; no singletons. */
export function createA2AJsonRpcServer(): A2AJsonRpcServer {
  const handlers = new Map<string, A2AMethodHandler>();
  return {
    register(method, handler): void {
      handlers.set(method, handler);
    },
    methods(): readonly string[] {
      return [...handlers.keys()];
    },
    async handleA2ARpc(raw: unknown, ctx: A2ACallContext = {}): Promise<JsonRpcResponse> {
      if (!isRequest(raw)) {
        const id = typeof raw === 'object' && raw !== null && 'id' in raw ? (raw as JsonRpcRequest).id : null;
        return rpcError(id ?? null, -32600, 'Invalid JSON-RPC request.');
      }
      const req = raw;
      const handler = handlers.get(req.method);
      if (!handler) {
        return rpcError(req.id, -32601, `Method not found or not wired: ${req.method}`);
      }
      try {
        const result = await handler(req, ctx);
        return { jsonrpc: '2.0', id: req.id, result };
      } catch (err) {
        if (err instanceof RpcError) {
          return rpcError(req.id, err.rpcCode, err.message, err.data);
        }
        return rpcError(req.id, -32000, err instanceof Error ? err.message : 'A2A method failed.');
      }
    },
  };
}
