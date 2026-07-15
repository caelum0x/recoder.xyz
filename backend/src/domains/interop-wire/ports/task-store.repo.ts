/**
 * `TaskStoreRepo` — the persistence seam for the A2A task lifecycle PROJECTION
 * (`interop_tasks`), its message log (`interop_task_messages`), and the shared
 * per-task scratchpad (`interop_scratchpad`).
 *
 * The canonical Run state-of-record stays in agent-os; this projection backs the
 * JSON-RPC surface (`tasks/get`) + the context-bridge scratchpad. The concrete
 * impl (`repositories/task-store.repository.ts`) binds this to the persistence
 * `QueryExecutor` with `:param` SQL + app-layer tenancy. Interface only.
 */
import type {
  A2ATaskState,
  AppendMessageInput,
  AppendScratchpadInput,
  CreateTaskInput,
  ScratchpadEntry,
  TaskMessageRow,
  TaskRow,
} from '../types.js';

export interface TaskStoreRepo {
  /** Create a task projection row; returns the persisted row. */
  createTask(input: CreateTaskInput): Promise<TaskRow>;
  /** One task by id, scoped to its owner; `null` when absent / not owned. */
  getTask(id: string, userId: string): Promise<TaskRow | null>;
  /** Transition a task's state; returns the updated row or `null` when absent. */
  setState(id: string, userId: string, state: A2ATaskState): Promise<TaskRow | null>;
  /** All messages for a task, oldest-first. */
  listMessages(taskId: string): Promise<readonly TaskMessageRow[]>;
  /** Append one A2A message to a task. */
  appendMessage(input: AppendMessageInput): Promise<TaskMessageRow>;
  /** Append a scratchpad note (server assigns the next `seq`). */
  appendScratchpad(input: AppendScratchpadInput): Promise<ScratchpadEntry>;
  /** Read the (non-expired) scratchpad for a task, oldest-first. */
  readScratchpad(taskId: string, now?: Date): Promise<readonly ScratchpadEntry[]>;
}
