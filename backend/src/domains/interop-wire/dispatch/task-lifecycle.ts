/**
 * `task-lifecycle` — the A2A task PROJECTION state machine over the frozen
 * {@link TaskStoreRepo}. The canonical Run state-of-record stays in agent-os; this
 * service owns the legal-transition guard, the message log, and the truthful
 * `tasks/get` view the JSON-RPC surface serves.
 *
 * Fail-closed by construction:
 *   - an illegal transition (e.g. `completed → working`) is REFUSED with a stable
 *     reason, never silently applied;
 *   - a terminal state (`completed|failed|canceled`) admits no further transition;
 *   - a not-owned / absent task resolves to `null`, never a fabricated row.
 *
 * Pure service: it holds no state of its own — every read/write goes through the
 * injected repo, so it degrades exactly as the repo does (in-memory when the
 * persistence executor is absent).
 */
import type { TaskStoreRepo } from '../ports/task-store.repo.js';
import {
  TERMINAL_TASK_STATES,
  type A2ATaskState,
  type AppendMessageInput,
  type CreateTaskInput,
  type TaskMessageRow,
  type TaskRow,
} from '../types.js';

/** The legal successor states for each A2A task state (fail-closed elsewhere). */
export const LEGAL_TASK_TRANSITIONS: Readonly<Record<A2ATaskState, readonly A2ATaskState[]>> = {
  submitted: ['working', 'input-required', 'completed', 'failed', 'canceled'],
  working: ['input-required', 'completed', 'failed', 'canceled'],
  'input-required': ['working', 'completed', 'failed', 'canceled'],
  completed: [],
  failed: [],
  canceled: [],
};

/** The non-terminal states an agent may still act on (the "inbox"). */
export const OPEN_TASK_STATES: readonly A2ATaskState[] = ['submitted', 'working', 'input-required'];

/** True when `state` is terminal (no further transition permitted). */
export function isTerminalTaskState(state: A2ATaskState): boolean {
  return (TERMINAL_TASK_STATES as readonly A2ATaskState[]).includes(state);
}

/** True when `from → to` is a permitted transition. */
export function isLegalTransition(from: A2ATaskState, to: A2ATaskState): boolean {
  return (LEGAL_TASK_TRANSITIONS[from] ?? []).includes(to);
}

/** The outcome of a transition attempt (never throws on an illegal move). */
export interface TransitionResult {
  readonly ok: boolean;
  /** The updated row on success; `null` on refusal / absent. */
  readonly task: TaskRow | null;
  /** Stable reason code (`transitioned|illegal_transition|terminal|not_found`). */
  readonly code: string;
  readonly reason: string;
}

let msgSeq = 0;
function newMessageId(): string {
  msgSeq += 1;
  return `a2a_msg_${Date.now().toString(36)}_${msgSeq.toString(36)}`;
}

export interface TaskLifecycleService {
  /** Create a new task projection (idempotent on id via the repo upsert). */
  create(input: CreateTaskInput): Promise<TaskRow>;
  /** Read one task, owner-scoped; `null` when absent / not owned. */
  get(id: string, userId: string): Promise<TaskRow | null>;
  /** List an owner's tasks (most-recent-first), optionally filtered by state. */
  list(userId: string, opts?: { states?: readonly A2ATaskState[]; limit?: number }): Promise<readonly TaskRow[]>;
  /** The owner's OPEN (non-terminal) tasks — the agent's work inbox. */
  inbox(userId: string, limit?: number): Promise<readonly TaskRow[]>;
  /** Attempt a state transition; refuses illegal/terminal moves (fail-closed). */
  transition(id: string, userId: string, to: A2ATaskState): Promise<TransitionResult>;
  /** Cancel a task (helper over `transition` to `canceled`). */
  cancel(id: string, userId: string): Promise<TransitionResult>;
  /** Append an A2A message to a task (id auto-assigned when omitted). */
  appendMessage(input: Omit<AppendMessageInput, 'id'> & { id?: string }): Promise<TaskMessageRow>;
  /** All messages for a task, oldest-first. */
  messages(taskId: string): Promise<readonly TaskMessageRow[]>;
}

/** Build the task-lifecycle service over the frozen task-store repo. */
export function createTaskLifecycleService(repo: TaskStoreRepo): TaskLifecycleService {
  return {
    async create(input: CreateTaskInput): Promise<TaskRow> {
      return repo.createTask(input);
    },

    async get(id: string, userId: string): Promise<TaskRow | null> {
      return repo.getTask(id, userId);
    },

    async list(
      userId: string,
      opts?: { states?: readonly A2ATaskState[]; limit?: number },
    ): Promise<readonly TaskRow[]> {
      return repo.listTasks(userId, opts);
    },

    async inbox(userId: string, limit?: number): Promise<readonly TaskRow[]> {
      // The non-terminal states an agent may still act on.
      return repo.listTasks(userId, { states: OPEN_TASK_STATES, ...(limit ? { limit } : {}) });
    },

    async transition(id: string, userId: string, to: A2ATaskState): Promise<TransitionResult> {
      const current = await repo.getTask(id, userId);
      if (!current) {
        return { ok: false, task: null, code: 'not_found', reason: `Task ${id} not found or not owned.` };
      }
      if (current.state === to) {
        // Idempotent no-op transition to the same state.
        return { ok: true, task: current, code: 'transitioned', reason: `Task already ${to}.` };
      }
      if (isTerminalTaskState(current.state)) {
        return {
          ok: false,
          task: current,
          code: 'terminal',
          reason: `Task ${id} is terminal (${current.state}); no transition to ${to}.`,
        };
      }
      if (!isLegalTransition(current.state, to)) {
        return {
          ok: false,
          task: current,
          code: 'illegal_transition',
          reason: `Illegal transition ${current.state} → ${to}.`,
        };
      }
      const updated = await repo.setState(id, userId, to);
      if (!updated) {
        return { ok: false, task: null, code: 'not_found', reason: `Task ${id} vanished during transition.` };
      }
      return { ok: true, task: updated, code: 'transitioned', reason: `Task ${id} → ${to}.` };
    },

    async cancel(id: string, userId: string): Promise<TransitionResult> {
      return this.transition(id, userId, 'canceled');
    },

    async appendMessage(
      input: Omit<AppendMessageInput, 'id'> & { id?: string },
    ): Promise<TaskMessageRow> {
      return repo.appendMessage({ id: input.id ?? newMessageId(), taskId: input.taskId, role: input.role, parts: input.parts });
    },

    async messages(taskId: string): Promise<readonly TaskMessageRow[]> {
      return repo.listMessages(taskId);
    },
  };
}
