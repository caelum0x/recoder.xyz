/**
 * `a2a-methods` — binds the canonical A2A JSON-RPC methods (`message/send`,
 * `tasks/get`, `tasks/cancel`, `tasks/resubscribe`) to the task-lifecycle +
 * multi-dispatch services and registers them on the frozen
 * {@link A2AJsonRpcServer}.
 *
 * The JSON-RPC edge is reached only AFTER the signed-ingress gate admits the
 * request (hostile-by-default), so these handlers trust the admitted params'
 * shape but still validate fail-fast and map a not-found/illegal-transition onto a
 * spec `RpcError` (never a fabricated `result`).
 *
 * `userId` is carried in params because the A2A wire has no session cookie; the
 * ingress gate proves the envelope's signature and the host boundary enforces
 * ownership — this layer stays owner-scoped through the provided id.
 */
import type { EnvelopeService } from '../wire/a2a-envelope.service.js';
import { A2A_METHODS, RpcError, type A2AJsonRpcServer, type JsonRpcRequest } from '../wire/a2a-jsonrpc-server.js';
import type { MultiDispatchService } from './multi-dispatch.js';
import type { TaskLifecycleService } from './task-lifecycle.js';

/** Spec-ish domain RPC codes layered on top of JSON-RPC's reserved range. */
export const A2A_RPC_CODES = {
  INVALID_PARAMS: -32602,
  TASK_NOT_FOUND: -32001,
  ILLEGAL_TRANSITION: -32002,
} as const;

function paramsOf(req: JsonRpcRequest): Record<string, unknown> {
  const p = req.params;
  if (typeof p !== 'object' || p === null) {
    throw new RpcError(A2A_RPC_CODES.INVALID_PARAMS, 'params must be an object');
  }
  return p as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new RpcError(A2A_RPC_CODES.INVALID_PARAMS, `\`${key}\` is required`);
  }
  return v;
}

export interface A2AMethodDeps {
  readonly jsonRpc: A2AJsonRpcServer;
  readonly tasks: TaskLifecycleService;
  readonly dispatch: MultiDispatchService;
  readonly envelope: EnvelopeService;
}

/** Register the four canonical A2A methods on the JSON-RPC server. */
export function registerA2AMethods(deps: A2AMethodDeps): void {
  const { jsonRpc, tasks, dispatch, envelope } = deps;

  jsonRpc.register(A2A_METHODS.TASKS_GET, async (req) => {
    const p = paramsOf(req);
    const id = requireString(p, 'id');
    const userId = requireString(p, 'userId');
    const task = await tasks.get(id, userId);
    if (!task) throw new RpcError(A2A_RPC_CODES.TASK_NOT_FOUND, `Task ${id} not found.`);
    const messages = await tasks.messages(id);
    return { task, messages };
  });

  jsonRpc.register(A2A_METHODS.TASKS_CANCEL, async (req) => {
    const p = paramsOf(req);
    const id = requireString(p, 'id');
    const userId = requireString(p, 'userId');
    const result = await tasks.cancel(id, userId);
    if (!result.ok) {
      const code = result.code === 'not_found' ? A2A_RPC_CODES.TASK_NOT_FOUND : A2A_RPC_CODES.ILLEGAL_TRANSITION;
      throw new RpcError(code, result.reason);
    }
    return { task: result.task };
  });

  jsonRpc.register(A2A_METHODS.TASKS_RESUBSCRIBE, async (req) => {
    const p = paramsOf(req);
    const id = requireString(p, 'id');
    const userId = requireString(p, 'userId');
    const task = await tasks.get(id, userId);
    if (!task) throw new RpcError(A2A_RPC_CODES.TASK_NOT_FOUND, `Task ${id} not found.`);
    return { task, messages: await tasks.messages(id) };
  });

  jsonRpc.register(A2A_METHODS.MESSAGE_SEND, async (req) => {
    const p = paramsOf(req);
    const userId = requireString(p, 'userId');
    const message = p.message;
    if (typeof message !== 'object' || message === null) {
      throw new RpcError(A2A_RPC_CODES.INVALID_PARAMS, '`message` object is required');
    }
    const msg = message as Record<string, unknown>;
    const targets = Array.isArray(p.targets) ? p.targets.filter((t): t is string => typeof t === 'string') : [];
    if (targets.length === 0) {
      throw new RpcError(A2A_RPC_CODES.INVALID_PARAMS, '`targets` must be a non-empty string array');
    }
    const env = envelope.buildEnvelope({
      from: typeof msg.from === 'string' ? msg.from : userId,
      to: typeof msg.to === 'string' ? msg.to : undefined,
      kind: typeof msg.kind === 'string' ? msg.kind : 'message',
      payload: { text: typeof msg.text === 'string' ? msg.text : '', ...(msg.data ? { data: msg.data } : {}) },
      correlationId: typeof p.correlationId === 'string' ? p.correlationId : undefined,
    });
    const result = await dispatch.dispatch({
      userId,
      targets,
      envelope: env,
      prompt: typeof msg.text === 'string' ? msg.text : undefined,
      ...(typeof p.taskId === 'string' ? { taskId: p.taskId } : {}),
    });
    return result;
  });
}
