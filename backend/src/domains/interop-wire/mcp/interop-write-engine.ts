/**
 * interop-wire WRITE MCP tools — the governed, agent-facing WRITE surface for the
 * A2A task fabric, registered alongside the read-only introspection tools
 * (`mcp/interop-engine.ts`) into the interop-gated MCP host. Every call passes the
 * host boundary's `authorize→risk→policy→audit` chain, so these handlers stay thin
 * and truthful over the composed dispatch / lifecycle / handoff services.
 *
 *   - `interop_send_task` — open a NEW A2A task and fan a message out to targets
 *      under a response strategy (`all | first | quorum`).
 *   - `interop_dispatch`  — fan a follow-up message onto an EXISTING task.
 *   - `interop_respond`   — append an agent RESPONSE to a task (+ optional state).
 *   - `interop_inbox`     — the caller's OPEN (non-terminal) tasks — the work inbox.
 *
 * Degrade-safe: with no conductor/remote seam wired, dispatch legs fail truthfully
 * and the tool reports `ok:false` with the leg reasons — never a faked success.
 *
 * TENANT SCOPING (SECURITY): every tool here acts on OWNER-scoped tenant state —
 * `interop_respond` reads/transitions a task via `tasks.get(taskId, userId)`,
 * `interop_inbox` discloses `tasks.inbox(userId)`, and send/dispatch stamp the A2A
 * envelope `from = userId` (impersonation surface). The subject (`userId`) is a
 * tenant-owned selector, so — exactly like the caller-bound READ sibling
 * (`mcp/interop-engine.ts`) — it is derived from the host-authorized
 * {@link McpToolCaller}, NEVER trusted from free-form `args`. The edge binds the
 * authenticated principal as the caller; the `args.userId` subject-selector is NOT
 * edge-bound, so trusting it would let any authorized caller respond to / transition
 * / read another tenant's task, disclose its inbox, or dispatch a task impersonating
 * a victim (`from = victim`). Therefore:
 *   - A NON-privileged caller may only act on its OWN `userId`; a foreign
 *     `args.userId` is rejected (403 `AUTHZ_PROJECT_ACCESS_DENIED`). No args ⇒ the
 *     caller's own id. Only an `admin`/`internal` caller may name an arbitrary id.
 *   - These tools are the governed WRITE surface exposed through the HTTP edge, so
 *     an ABSENT caller is refused (`AUTH_REQUIRED`) — never resolved from the arg.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { EnvelopeService } from '../wire/a2a-envelope.service.js';
import type { DispatchStrategy, MultiDispatchResult, MultiDispatchService } from '../dispatch/multi-dispatch.js';
import type { TaskLifecycleService } from '../dispatch/task-lifecycle.js';
import type { TaskMessageRow, A2ATaskState } from '../types.js';

export interface InteropWriteEngineDeps {
  readonly dispatch: MultiDispatchService;
  readonly tasks: TaskLifecycleService;
  readonly envelope: EnvelopeService;
  /**
   * The service identity scope. Retained for parity with the read sibling and
   * future trusted-internal wiring; the write tools do NOT fall back to it for
   * subject resolution — an absent caller is refused (`AUTH_REQUIRED`).
   */
  readonly ownerId: string;
}

const VALID_STRATEGIES: readonly DispatchStrategy[] = ['all', 'first', 'quorum'];
const RESPONSE_ROLES: readonly TaskMessageRow['role'][] = ['agent', 'system'];
/** The task states a `respond` may explicitly move a task to (fail-closed elsewhere). */
const RESPONDABLE_STATES: readonly A2ATaskState[] = ['working', 'input-required', 'completed', 'failed'];

interface SendTaskInput {
  readonly userId?: string;
  readonly targets?: unknown;
  readonly text?: string;
  readonly kind?: string;
  readonly strategy?: string;
  readonly quorum?: number;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly data?: unknown;
}
interface RespondInput {
  readonly userId?: string;
  readonly taskId?: string;
  readonly text?: string;
  readonly role?: string;
  readonly state?: string;
  readonly data?: unknown;
}
interface InboxInput {
  readonly userId?: string;
  readonly limit?: number;
}

function requireStringArray(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string' && t.length > 0) : [];
  if (arr.length === 0) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'targets must be a non-empty string array');
  }
  return arr;
}

function coerceStrategy(raw: string | undefined): DispatchStrategy {
  return raw && (VALID_STRATEGIES as readonly string[]).includes(raw) ? (raw as DispatchStrategy) : 'all';
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Does the caller carry an elevated scope that may act on an arbitrary subject? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** The truthful, MCP-shaped view of a dispatch outcome. */
function viewDispatch(result: MultiDispatchResult) {
  return {
    ok: result.ok,
    taskId: result.taskId,
    strategy: result.strategy,
    satisfied: result.satisfied,
    legs: result.legs,
  };
}

export function buildInteropWriteMcpTools(deps: InteropWriteEngineDeps): readonly McpToolRegistration[] {
  const { dispatch, tasks, envelope } = deps;

  /**
   * Resolve the OWNER subject a governed write is keyed to, bound to the
   * host-authorized caller. A caller-supplied `args.userId` is NOT an authority
   * source: a non-privileged caller may only act as its OWN subject (a differing
   * `args.userId` is a 403 cross-tenant spoof), only an `admin`/`internal` caller
   * may name an arbitrary subject, and — since this is the edge-exposed WRITE
   * surface — an absent caller is refused (`AUTH_REQUIRED`) rather than trusting
   * the arg.
   */
  const resolveSubject = (raw: unknown, caller: McpToolCaller | undefined, tool: string): string => {
    const callerId = caller ? str(caller.userId) : undefined;
    if (!callerId) {
      throw createError(ErrorCode.AUTH_REQUIRED, `${tool}: no authorized caller identity`);
    }
    const requested = str((raw as { userId?: unknown } | undefined)?.userId);
    if (requested && requested !== callerId && !isPrivileged(caller!)) {
      throw createError(
        ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
        `${tool}: caller may only act on its own tenant subject`,
      );
    }
    return requested ?? callerId;
  };

  async function dispatchMessage(input: SendTaskInput, userId: string, reuseTaskId: boolean) {
    const targets = requireStringArray(input.targets);
    const text = typeof input.text === 'string' ? input.text : '';
    if (reuseTaskId && (typeof input.taskId !== 'string' || input.taskId.length === 0)) {
      throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'taskId is required');
    }
    const env = envelope.buildEnvelope({
      from: userId,
      kind: typeof input.kind === 'string' ? input.kind : 'message',
      payload: { text, ...(input.data !== undefined ? { data: input.data } : {}) },
      ...(typeof input.correlationId === 'string' ? { correlationId: input.correlationId } : {}),
    });
    const result = await dispatch.dispatch({
      userId,
      targets,
      envelope: env,
      prompt: text,
      strategy: coerceStrategy(input.strategy),
      ...(typeof input.quorum === 'number' ? { quorum: input.quorum } : {}),
      ...(reuseTaskId ? { taskId: input.taskId as string } : {}),
    });
    return viewDispatch(result);
  }

  return [
    {
      name: 'interop_send_task',
      description:
        'Open a NEW A2A task and fan a message out to one or more registered targets under a response strategy (all | first | quorum). Returns the taskId + per-leg outcomes; ok reflects the real strategy result (never faked).',
      handler: async (raw: unknown, caller?: McpToolCaller) =>
        dispatchMessage((raw ?? {}) as SendTaskInput, resolveSubject(raw, caller, 'interop_send_task'), false),
    },
    {
      name: 'interop_dispatch',
      description:
        'Fan a follow-up message onto an EXISTING A2A task (taskId required) to one or more targets under a response strategy. Truthful per-leg outcomes; degrade-safe when no dispatch seam is wired.',
      handler: async (raw: unknown, caller?: McpToolCaller) =>
        dispatchMessage((raw ?? {}) as SendTaskInput, resolveSubject(raw, caller, 'interop_dispatch'), true),
    },
    {
      name: 'interop_respond',
      description:
        'Append an agent RESPONSE message to an owned A2A task and OPTIONALLY move it to a new state (working | input-required | completed | failed). Owner-scoped: an unowned/absent task is refused, never fabricated.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as RespondInput;
        const userId = resolveSubject(raw, caller, 'interop_respond');
        const taskId = input.taskId?.trim();
        if (!taskId) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'taskId is required');
        const text = typeof input.text === 'string' ? input.text : '';
        if (!text) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'text is required');
        const task = await tasks.get(taskId, userId);
        if (!task) throw createError(ErrorCode.NOT_FOUND, 'task not found or not owned');
        const role = (RESPONSE_ROLES as readonly string[]).includes(input.role ?? '')
          ? (input.role as TaskMessageRow['role'])
          : 'agent';
        const message = await tasks.appendMessage({
          taskId,
          role,
          parts: [{ kind: 'text', text }, ...(input.data !== undefined ? [{ kind: 'data', data: input.data }] : [])],
        });
        let transition: { ok: boolean; code: string; reason: string; state?: A2ATaskState } | undefined;
        if (typeof input.state === 'string' && (RESPONDABLE_STATES as readonly string[]).includes(input.state)) {
          const res = await tasks.transition(taskId, userId, input.state as A2ATaskState);
          transition = { ok: res.ok, code: res.code, reason: res.reason, ...(res.task ? { state: res.task.state } : {}) };
        }
        return { ok: true, taskId, message, ...(transition ? { transition } : {}) };
      },
    },
    {
      name: 'interop_inbox',
      description:
        "List the caller's OPEN (non-terminal: submitted | working | input-required) A2A tasks — the agent's work inbox, most-recent-first. Read-only; returns [] truthfully when none are open.",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as InboxInput;
        const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.trunc(input.limit) : undefined;
        const tasksOpen = await tasks.inbox(resolveSubject(raw, caller, 'interop_inbox'), limit);
        return {
          count: tasksOpen.length,
          tasks: tasksOpen.map((t) => ({ id: t.id, state: t.state, runtimeId: t.runtimeId, correlation: t.correlation, updatedAt: t.updatedAt })),
        };
      },
    },
  ];
}
