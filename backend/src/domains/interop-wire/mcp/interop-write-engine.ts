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
 * Caller identity (`userId`) comes from the host's authorized principal; it is
 * never trusted from free-form model output beyond that binding.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { EnvelopeService } from '../wire/a2a-envelope.service.js';
import type { DispatchStrategy, MultiDispatchResult, MultiDispatchService } from '../dispatch/multi-dispatch.js';
import type { TaskLifecycleService } from '../dispatch/task-lifecycle.js';
import type { TaskMessageRow, A2ATaskState } from '../types.js';

export interface InteropWriteEngineDeps {
  readonly dispatch: MultiDispatchService;
  readonly tasks: TaskLifecycleService;
  readonly envelope: EnvelopeService;
  /** The owner scope these write tools resolve against (service identity fallback). */
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
  const { dispatch, tasks, envelope, ownerId } = deps;
  const owner = (input: { userId?: string }): string =>
    typeof input.userId === 'string' && input.userId.length > 0 ? input.userId : ownerId;

  async function dispatchMessage(input: SendTaskInput, reuseTaskId: boolean) {
    const userId = owner(input);
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
      handler: (raw: unknown) => dispatchMessage((raw ?? {}) as SendTaskInput, false),
    },
    {
      name: 'interop_dispatch',
      description:
        'Fan a follow-up message onto an EXISTING A2A task (taskId required) to one or more targets under a response strategy. Truthful per-leg outcomes; degrade-safe when no dispatch seam is wired.',
      handler: (raw: unknown) => dispatchMessage((raw ?? {}) as SendTaskInput, true),
    },
    {
      name: 'interop_respond',
      description:
        'Append an agent RESPONSE message to an owned A2A task and OPTIONALLY move it to a new state (working | input-required | completed | failed). Owner-scoped: an unowned/absent task is refused, never fabricated.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as RespondInput;
        const userId = owner(input);
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
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as InboxInput;
        const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.trunc(input.limit) : undefined;
        const tasksOpen = await tasks.inbox(owner(input), limit);
        return {
          count: tasksOpen.length,
          tasks: tasksOpen.map((t) => ({ id: t.id, state: t.state, runtimeId: t.runtimeId, correlation: t.correlation, updatedAt: t.updatedAt })),
        };
      },
    },
  ];
}
