/**
 * `a2a-jsonrpc-server` — SKELETON. The A2A standard JSON-RPC method surface
 * (`message/send`, `tasks/get`, `tasks/cancel`, …). The wire group routes these
 * methods into `task-lifecycle` + `dispatch`; this scaffold gives the composer +
 * routes a stable dispatcher and a spec-correct error for unimplemented methods.
 *
 * Fail-closed: an unknown OR not-yet-wired method returns a JSON-RPC error
 * (`-32601 Method not found` / `-32000 not implemented`), never a fake success.
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

/** A single method implementation the wire group registers. */
export type A2AMethodHandler = (req: JsonRpcRequest) => Promise<unknown> | unknown;

/** The dispatcher surface `routes/interop.routes.ts` mounts at `POST /api/a2a/rpc`. */
export interface A2AJsonRpcServer {
  register(method: A2AMethod | string, handler: A2AMethodHandler): void;
  handleA2ARpc(req: JsonRpcRequest): Promise<JsonRpcResponse>;
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * Scaffold JSON-RPC server. Methods are registered by the wire group; an unknown
 * method returns `-32601`, and a registered-but-throwing handler surfaces
 * `-32000` — never a fabricated `result`.
 */
export function createA2AJsonRpcServer(): A2AJsonRpcServer {
  const handlers = new Map<string, A2AMethodHandler>();
  return {
    register(method, handler): void {
      handlers.set(method, handler);
    },
    async handleA2ARpc(req: JsonRpcRequest): Promise<JsonRpcResponse> {
      if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
        return rpcError(req?.id ?? null, -32600, 'Invalid JSON-RPC request.');
      }
      const handler = handlers.get(req.method);
      if (!handler) {
        return rpcError(req.id, -32601, `Method not found or not wired: ${req.method}`);
      }
      try {
        const result = await handler(req);
        return { jsonrpc: '2.0', id: req.id, result };
      } catch (err) {
        return rpcError(req.id, -32000, err instanceof Error ? err.message : 'A2A method failed.');
      }
    },
  };
}
