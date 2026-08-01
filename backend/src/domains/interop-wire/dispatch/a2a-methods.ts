/**
 * `a2a-methods` — binds the canonical A2A JSON-RPC methods (`message/send`,
 * `message/stream`, `tasks/get`, `tasks/cancel`, `tasks/resubscribe`) to the
 * task-lifecycle + multi-dispatch services and registers them on the frozen
 * {@link A2AJsonRpcServer}.
 *
 * `message/stream` reuses BOTH the `message/send` dispatch path (open/reuse the
 * task, record the inbound message, fan out) and the `tasks/resubscribe`
 * projection path (owner-scoped `tasks.get` + `tasks.messages`) to hand the caller
 * the current RunEvent stream (the task's message log) right after dispatch —
 * without adding a second transport. Ownership stays bound to the verified signer,
 * exactly as the other methods.
 *
 * The JSON-RPC edge is reached only AFTER the signed-ingress gate admits the
 * request (hostile-by-default), so these handlers trust the admitted params'
 * shape but still validate fail-fast and map a not-found/illegal-transition onto a
 * spec `RpcError` (never a fabricated `result`).
 *
 * Ownership derives from the cryptographically-verified signer, NOT from a
 * client-supplied `params.userId`: the A2A wire has no session cookie, so the
 * ed25519 signed-ingress gate proves the sender's `key_id` (the registered agent
 * id) and carries it into the handler via {@link A2ACallContext}. `key_id` is the
 * only trustworthy owner id — the envelope `from` and `params.userId` are
 * attacker-choosable by any enrolled peer, so trusting them lets one peer read or
 * cancel every other tenant's tasks (confused-deputy IDOR). A caller-supplied
 * `userId` that mismatches the verified signer is rejected. Only the insecure-dev
 * / solo posture (no signer) falls back to `params.userId` (single-tenant
 * fail-open).
 */
import type { EnvelopeService } from '../wire/a2a-envelope.service.js';
import {
  A2A_METHODS,
  RpcError,
  type A2ACallContext,
  type A2AJsonRpcServer,
  type JsonRpcRequest,
} from '../wire/a2a-jsonrpc-server.js';
import type { MultiDispatchResult, MultiDispatchService } from './multi-dispatch.js';
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

/**
 * The owner scope for a call. With a verified signer, ownership IS the proven
 * `key_id`; a `params.userId` that disagrees is a spoof (rejected). Without a
 * signer (insecure-dev / solo posture) the caller-supplied `userId` is required
 * and trusted (single-tenant fail-open).
 */
function ownerOf(p: Record<string, unknown>, ctx: A2ACallContext): string {
  const signer = ctx.signer;
  if (!signer) return requireString(p, 'userId');
  const claimed = p.userId;
  if (typeof claimed === 'string' && claimed.length > 0 && claimed !== signer.keyId) {
    throw new RpcError(A2A_RPC_CODES.INVALID_PARAMS, '`userId` does not match the signed sender identity.');
  }
  return signer.keyId;
}

export interface A2AMethodDeps {
  readonly jsonRpc: A2AJsonRpcServer;
  readonly tasks: TaskLifecycleService;
  readonly dispatch: MultiDispatchService;
  readonly envelope: EnvelopeService;
}

/**
 * Shared `message/send` + `message/stream` core: validate the params (fail-fast),
 * seal the envelope under the VERIFIED owner, and fan out via multi-dispatch.
 * Returns the owner it dispatched under (so the streaming caller can re-project the
 * task under the same signer scope) alongside the truthful dispatch result.
 */
async function dispatchMessage(
  p: Record<string, unknown>,
  ctx: A2ACallContext,
  dispatch: MultiDispatchService,
  envelope: EnvelopeService,
): Promise<{ readonly userId: string; readonly result: MultiDispatchResult }> {
  const userId = ownerOf(p, ctx);
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
    // When signed, `from` IS the verified sender (userId === signer.keyId);
    // never let a peer stamp someone else's id on the outbound envelope.
    from: ctx.signer ? userId : typeof msg.from === 'string' ? msg.from : userId,
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
    // Optional multi-peer response strategy (default `all`; validated in dispatch).
    ...(p.strategy === 'all' || p.strategy === 'first' || p.strategy === 'quorum' ? { strategy: p.strategy } : {}),
    ...(typeof p.quorum === 'number' ? { quorum: p.quorum } : {}),
  });
  return { userId, result };
}

/** Register the four canonical A2A methods on the JSON-RPC server. */
export function registerA2AMethods(deps: A2AMethodDeps): void {
  const { jsonRpc, tasks, dispatch, envelope } = deps;

  jsonRpc.register(A2A_METHODS.TASKS_GET, async (req, ctx) => {
    const p = paramsOf(req);
    const id = requireString(p, 'id');
    const userId = ownerOf(p, ctx);
    const task = await tasks.get(id, userId);
    if (!task) throw new RpcError(A2A_RPC_CODES.TASK_NOT_FOUND, `Task ${id} not found.`);
    const messages = await tasks.messages(id);
    return { task, messages };
  });

  jsonRpc.register(A2A_METHODS.TASKS_CANCEL, async (req, ctx) => {
    const p = paramsOf(req);
    const id = requireString(p, 'id');
    const userId = ownerOf(p, ctx);
    const result = await tasks.cancel(id, userId);
    if (!result.ok) {
      const code = result.code === 'not_found' ? A2A_RPC_CODES.TASK_NOT_FOUND : A2A_RPC_CODES.ILLEGAL_TRANSITION;
      throw new RpcError(code, result.reason);
    }
    return { task: result.task };
  });

  jsonRpc.register(A2A_METHODS.TASKS_RESUBSCRIBE, async (req, ctx) => {
    const p = paramsOf(req);
    const id = requireString(p, 'id');
    const userId = ownerOf(p, ctx);
    const task = await tasks.get(id, userId);
    if (!task) throw new RpcError(A2A_RPC_CODES.TASK_NOT_FOUND, `Task ${id} not found.`);
    return { task, messages: await tasks.messages(id) };
  });

  jsonRpc.register(A2A_METHODS.MESSAGE_SEND, async (req, ctx) => {
    const p = paramsOf(req);
    const { result } = await dispatchMessage(p, ctx, dispatch, envelope);
    return result;
  });

  // `message/stream` — dispatch exactly like `message/send`, then reuse the
  // `tasks/resubscribe` projection (owner-scoped `get` + `messages`) to return the
  // current RunEvent stream (the task's message log) to the caller. `streaming` is
  // set so a client can tell a stream reply from a plain send. Fail-closed: if the
  // just-dispatched task is not owner-visible, `events` is empty (never fabricated).
  jsonRpc.register(A2A_METHODS.MESSAGE_STREAM, async (req, ctx) => {
    const p = paramsOf(req);
    const { userId, result } = await dispatchMessage(p, ctx, dispatch, envelope);
    const task = await tasks.get(result.taskId, userId);
    const events = task ? await tasks.messages(result.taskId) : [];
    return { streaming: true, result, task, events };
  });
}
