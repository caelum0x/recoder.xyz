/**
 * `createTaskStoreRepo` — the {@link TaskStoreRepo} impl over the persistence
 * {@link QueryExecutor} (`interop_tasks` + `interop_task_messages` +
 * `interop_scratchpad`).
 *
 * All access is parameterized `:param` SQL with app-layer tenancy
 * (`WHERE user_id = :user_id`) — NO Supabase RLS. This is a PROJECTION for the
 * A2A JSON-RPC surface; the canonical Run state-of-record stays in agent-os.
 *
 * DEGRADE-SAFE: when `executor.isAvailable()` is false the repo serves from a
 * bounded in-process store, and never fabricates a persisted row.
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { TaskStoreRepo } from '../ports/task-store.repo.js';
import type {
  A2ATaskState,
  AppendMessageInput,
  AppendScratchpadInput,
  CreateTaskInput,
  ScratchpadEntry,
  TaskMessageRow,
  TaskRow,
} from '../types.js';

export interface TaskStoreRepoDeps {
  readonly executor: QueryExecutor;
}

function rowToTask(row: QueryRow): TaskRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    runId: row.run_id == null ? undefined : String(row.run_id),
    runtimeId: row.runtime_id == null ? undefined : String(row.runtime_id),
    state: (row.state as A2ATaskState) ?? 'submitted',
    contextId: row.context_id == null ? undefined : String(row.context_id),
    correlation: row.correlation == null ? undefined : String(row.correlation),
    createdAt: row.created_at == null ? undefined : String(row.created_at),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

function decodeParts(raw: unknown): readonly unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToMessage(row: QueryRow): TaskMessageRow {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    role: (row.role as TaskMessageRow['role']) ?? 'system',
    parts: decodeParts(row.parts),
    createdAt: row.created_at == null ? undefined : String(row.created_at),
  };
}

/** Build the task-store repository over the persistence executor. */
export function createTaskStoreRepo(deps: TaskStoreRepoDeps): TaskStoreRepo {
  const { executor } = deps;
  const memTasks = new Map<string, TaskRow>();
  const memMessages = new Map<string, TaskMessageRow[]>();
  const memScratch = new Map<string, ScratchpadEntry[]>();
  const durable = (): boolean => executor.isAvailable();

  async function createTask(input: CreateTaskInput): Promise<TaskRow> {
    const row: TaskRow = {
      id: input.id,
      userId: input.userId,
      runId: input.runId,
      runtimeId: input.runtimeId,
      state: input.state ?? 'submitted',
      contextId: input.contextId,
      correlation: input.correlation,
    };
    memTasks.set(input.id, row);
    if (!durable()) return row;
    await executor.mutate(
      `insert into interop_tasks
         (id, user_id, run_id, runtime_id, state, context_id, correlation, created_at, updated_at)
       values
         (:id, :user_id, :run_id, :runtime_id, :state, :context_id, :correlation, now(), now())
       on conflict (id) do update set
         run_id = excluded.run_id,
         runtime_id = excluded.runtime_id,
         state = excluded.state,
         context_id = excluded.context_id,
         correlation = excluded.correlation,
         updated_at = now()`,
      {
        id: input.id,
        user_id: input.userId,
        run_id: input.runId ?? null,
        runtime_id: input.runtimeId ?? null,
        state: input.state ?? 'submitted',
        context_id: input.contextId ?? null,
        correlation: input.correlation ?? null,
      },
    );
    return row;
  }

  async function getTask(id: string, userId: string): Promise<TaskRow | null> {
    if (!durable()) {
      const row = memTasks.get(id);
      return row && row.userId === userId ? row : null;
    }
    const rows = await executor.execute<QueryRow>(
      `select * from interop_tasks where id = :id and user_id = :user_id`,
      { id, user_id: userId },
    );
    return rows[0] ? rowToTask(rows[0]) : null;
  }

  async function setState(id: string, userId: string, state: A2ATaskState): Promise<TaskRow | null> {
    const existing = memTasks.get(id);
    if (existing && existing.userId === userId) memTasks.set(id, { ...existing, state });
    if (!durable()) {
      const row = memTasks.get(id);
      return row && row.userId === userId ? row : null;
    }
    const affected = await executor.mutate(
      `update interop_tasks set state = :state, updated_at = now() where id = :id and user_id = :user_id`,
      { state, id, user_id: userId },
    );
    if (affected === 0) return null;
    return getTask(id, userId);
  }

  async function listMessages(taskId: string): Promise<readonly TaskMessageRow[]> {
    if (!durable()) return memMessages.get(taskId) ?? [];
    const rows = await executor.execute<QueryRow>(
      `select * from interop_task_messages where task_id = :task_id order by created_at asc`,
      { task_id: taskId },
    );
    return rows.map(rowToMessage);
  }

  async function appendMessage(input: AppendMessageInput): Promise<TaskMessageRow> {
    const row: TaskMessageRow = { id: input.id, taskId: input.taskId, role: input.role, parts: input.parts };
    const list = memMessages.get(input.taskId) ?? [];
    list.push(row);
    memMessages.set(input.taskId, list);
    if (!durable()) return row;
    await executor.mutate(
      `insert into interop_task_messages (id, task_id, role, parts, created_at)
       values (:id, :task_id, :role, cast(:parts as jsonb), now())
       on conflict (id) do nothing`,
      { id: input.id, task_id: input.taskId, role: input.role, parts: JSON.stringify(input.parts) },
    );
    return row;
  }

  async function appendScratchpad(input: AppendScratchpadInput): Promise<ScratchpadEntry> {
    if (!durable()) {
      const list = memScratch.get(input.taskId) ?? [];
      const seq = list.length + 1;
      const entry: ScratchpadEntry = {
        taskId: input.taskId,
        seq,
        author: input.author,
        note: input.note,
        expiresAt: input.expiresAt,
        createdAt: new Date().toISOString(),
      };
      list.push(entry);
      memScratch.set(input.taskId, list);
      return entry;
    }
    // Atomically assign the next seq under the executor to avoid a race.
    return executor.withTransaction(async (tx) => {
      const seqRows = await tx.execute<QueryRow>(
        `select coalesce(max(seq), 0) + 1 as next_seq from interop_scratchpad where task_id = :task_id`,
        { task_id: input.taskId },
      );
      const seq = Number(seqRows[0]?.next_seq ?? 1);
      await tx.mutate(
        `insert into interop_scratchpad (task_id, seq, author, note, expires_at, created_at)
         values (:task_id, :seq, :author, :note, cast(:expires_at as timestamptz), now())`,
        {
          task_id: input.taskId,
          seq,
          author: input.author,
          note: input.note,
          expires_at: input.expiresAt ?? null,
        },
      );
      return {
        taskId: input.taskId,
        seq,
        author: input.author,
        note: input.note,
        expiresAt: input.expiresAt,
        createdAt: new Date().toISOString(),
      };
    });
  }

  async function readScratchpad(taskId: string, now: Date = new Date()): Promise<readonly ScratchpadEntry[]> {
    if (!durable()) {
      const list = memScratch.get(taskId) ?? [];
      return list.filter((e) => !e.expiresAt || Date.parse(e.expiresAt) > now.getTime());
    }
    const rows = await executor.execute<QueryRow>(
      `select task_id, seq, author, note, expires_at, created_at from interop_scratchpad
       where task_id = :task_id and (expires_at is null or expires_at > :now)
       order by seq asc`,
      { task_id: taskId, now: now.toISOString() },
    );
    return rows.map((row) => ({
      taskId: String(row.task_id),
      seq: Number(row.seq),
      author: String(row.author),
      note: String(row.note),
      expiresAt: row.expires_at == null ? undefined : String(row.expires_at),
      createdAt: row.created_at == null ? undefined : String(row.created_at),
    }));
  }

  return {
    createTask,
    getTask,
    setState,
    listMessages,
    appendMessage,
    appendScratchpad,
    readScratchpad,
  };
}
