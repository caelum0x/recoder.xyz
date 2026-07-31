/**
 * `createWorkspaceRepository` — the conductor's {@link WorkspaceRepositoryPort}
 * impl over the Phase-1 persistence {@link QueryExecutor}.
 *
 * OWNERSHIP SPLIT (domain doc §4 + BUILD-ORDER conflict #4): the conductor domain
 * is the SOLE owner of `conductor_workspaces`, `conductor_run_tails`, and
 * `conductor_reconcile_findings` (migrations 0001–0003), so those are persisted
 * durably here through the injected executor. The canonical `TaskRun` / `RunEvent`
 * / `TaskSpec` tables are owned by the agent-os domain (task #16) and reached ONLY
 * through the injected {@link CanonicalRunStore} (the backend `AgentOsRepositoryPort`,
 * bound at the composition root over the SAME persistence executor). When that
 * store is bound and the executor is available it is the DURABLE SOURCE OF TRUTH
 * for `upsertRun`/`listRuns`/`appendEvent`/`listEvents`/`listTasks`, so run history
 * + the RunEvent log survive a backend restart (P1 #8). Absent it (tests) or with
 * the executor down (DB-less desktop) those five degrade to a bounded in-process
 * store so the engine's calls never no-op silently — but `isDurable()` then
 * reports `false` truthfully (the read-model does NOT survive a restart).
 *
 * DEGRADE-SAFE: when `executor.isAvailable()` is false EVERY table degrades to the
 * in-process store — the module still serves (reconcile/list work in-memory)
 * rather than crashing, and never fabricates a persisted row it did not write.
 * The full `Workspace` domain object is stored in `metadata.__recoderDomain`; the
 * typed columns exist for querying/joins only (mirrors the migration contract).
 */
import type { RunEvent, TaskRun, TaskSpec, Workspace } from '@recoder/agent-os';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type {
  CanonicalRunStore,
  PersistReconcileFindingInput,
  PersistRunTailInput,
  RunTailCursor,
  WorkspaceRepositoryPort,
} from '../ports/workspace-repository.port.js';
import type { ReconcileFindingView } from '../types.js';

const DOMAIN_KEY = '__recoderDomain';

export interface WorkspaceRepositoryDeps {
  readonly executor: QueryExecutor;
  /**
   * The DURABLE agent-os-owned canonical store for TaskRun / RunEvent / TaskSpec.
   * When bound (composition root) AND the executor is available, run/event
   * reads+writes delegate to it so they survive a restart. Absent ⇒ the bounded
   * in-process fallback (tests / no state-of-record).
   */
  readonly canonicalStore?: CanonicalRunStore;
}

/** Build the conductor workspace repository over the persistence executor. */
export function createWorkspaceRepository(deps: WorkspaceRepositoryDeps): WorkspaceRepositoryPort {
  const { executor, canonicalStore } = deps;

  // Bounded in-process fallback for the agent-os-owned canonical tables and for
  // the whole port when the executor is unavailable.
  const memWorkspaces = new Map<string, Workspace>();
  const memRuns = new Map<string, TaskRun>();
  const memEvents: RunEvent[] = [];
  const memTasks = new Map<string, TaskSpec>();
  const memTails = new Map<string, RunTailCursor>();
  const memFindings: ReconcileFindingView[] = [];

  const durable = (): boolean => executor.isAvailable();

  // The canonical run/event tables are durable ONLY when the agent-os store is
  // bound AND the executor is up. When the executor is down we do NOT delegate to
  // a postgres-backed store whose queries would reject — we fall back truthfully.
  const canonicalDurable = (): boolean => Boolean(canonicalStore) && executor.isAvailable();

  async function upsertWorkspace(workspace: Workspace): Promise<Workspace> {
    memWorkspaces.set(workspace.workspaceId, workspace);
    if (!durable()) return workspace;
    const metadata = { ...(workspace.metadata ?? {}), [DOMAIN_KEY]: workspace };
    await executor.mutate(
      `insert into conductor_workspaces
         (workspace_id, space_id, project_id, task_id, run_id, runtime_id, substrate,
          branch, base_ref, worktree_path, session_name, state, created_by, metadata,
          created_at, updated_at)
       values
         (:workspace_id, :space_id, :project_id, :task_id, :run_id, :runtime_id, :substrate,
          :branch, :base_ref, :worktree_path, :session_name, :state, :created_by,
          cast(:metadata as jsonb), coalesce(cast(:created_at as timestamptz), now()), now())
       on conflict (workspace_id) do update set
          run_id = excluded.run_id,
          runtime_id = excluded.runtime_id,
          substrate = excluded.substrate,
          branch = excluded.branch,
          base_ref = excluded.base_ref,
          worktree_path = excluded.worktree_path,
          session_name = excluded.session_name,
          state = excluded.state,
          metadata = excluded.metadata,
          updated_at = now()`,
      {
        workspace_id: workspace.workspaceId,
        space_id: workspace.spaceId,
        project_id: workspace.projectId,
        task_id: workspace.taskId,
        run_id: workspace.runId ?? null,
        runtime_id: workspace.runtimeId,
        substrate: workspace.substrate,
        branch: workspace.branch,
        base_ref: workspace.baseRef,
        worktree_path: workspace.worktreePath ?? null,
        session_name: workspace.sessionName ?? null,
        state: workspace.state,
        created_by: workspace.createdBy,
        metadata: JSON.stringify(metadata),
        created_at: workspace.createdAt ?? null,
      },
    );
    return workspace;
  }

  async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
    if (!durable()) return memWorkspaces.get(workspaceId) ?? null;
    const rows = await executor.execute<QueryRow>(
      `select metadata from conductor_workspaces where workspace_id = :id`,
      { id: workspaceId },
    );
    const row = rows[0];
    if (!row) return memWorkspaces.get(workspaceId) ?? null;
    return decodeWorkspace(row.metadata) ?? memWorkspaces.get(workspaceId) ?? null;
  }

  async function listWorkspaces(): Promise<Workspace[]> {
    if (!durable()) return [...memWorkspaces.values()];
    const rows = await executor.execute<QueryRow>(
      `select metadata from conductor_workspaces order by created_at desc`,
    );
    const decoded = rows
      .map((r) => decodeWorkspace(r.metadata))
      .filter((w): w is Workspace => w !== null);
    return decoded.length > 0 ? decoded : [...memWorkspaces.values()];
  }

  // --- canonical agent-os tables: durable via the injected store (P1 #8), with a
  //     bounded in-process fallback when it is absent or the executor is down. ---
  async function upsertRun(run: TaskRun): Promise<TaskRun> {
    if (canonicalStore && canonicalDurable()) return canonicalStore.upsertRun(run);
    memRuns.set(run.runId, run);
    return run;
  }
  async function listRuns(): Promise<TaskRun[]> {
    if (canonicalStore && canonicalDurable()) return canonicalStore.listRuns();
    return [...memRuns.values()];
  }
  async function appendEvent(event: RunEvent): Promise<RunEvent> {
    if (canonicalStore && canonicalDurable()) return canonicalStore.appendEvent(event);
    memEvents.push(event);
    return event;
  }
  async function listEvents(): Promise<RunEvent[]> {
    if (canonicalStore && canonicalDurable()) return canonicalStore.listEvents();
    return [...memEvents];
  }
  async function listTasks(): Promise<TaskSpec[]> {
    if (canonicalStore && canonicalDurable()) return canonicalStore.listTasks();
    return [...memTasks.values()];
  }

  // --- conductor_run_tails (restart-survivable tailing) ---
  async function persistTailCursor(input: PersistRunTailInput): Promise<RunTailCursor> {
    const cursor: RunTailCursor = {
      workspaceId: input.workspaceId,
      runId: input.runId,
      lastOffset: input.lastOffset,
      ...(input.lastCaptureHash !== undefined ? { lastCaptureHash: input.lastCaptureHash } : {}),
      ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
      finished: input.finished ?? false,
      updatedAt: new Date().toISOString(),
    };
    memTails.set(input.workspaceId, cursor);
    if (durable()) {
      await executor.mutate(
        `insert into conductor_run_tails
           (workspace_id, run_id, last_offset, last_capture_hash, exit_code, finished, updated_at)
         values (:workspace_id, :run_id, :last_offset, :last_capture_hash, :exit_code, :finished, now())
         on conflict (workspace_id) do update set
           run_id = excluded.run_id,
           last_offset = excluded.last_offset,
           last_capture_hash = excluded.last_capture_hash,
           exit_code = excluded.exit_code,
           finished = excluded.finished,
           updated_at = now()`,
        {
          workspace_id: input.workspaceId,
          run_id: input.runId,
          last_offset: input.lastOffset,
          last_capture_hash: input.lastCaptureHash ?? null,
          exit_code: input.exitCode ?? null,
          finished: input.finished ?? false,
        },
      );
    }
    return cursor;
  }

  async function getTailCursor(workspaceId: string): Promise<RunTailCursor | null> {
    if (!durable()) return memTails.get(workspaceId) ?? null;
    const rows = await executor.execute<QueryRow>(
      `select workspace_id, run_id, last_offset, last_capture_hash, exit_code, finished, updated_at
         from conductor_run_tails where workspace_id = :id`,
      { id: workspaceId },
    );
    const row = rows[0];
    if (!row) return memTails.get(workspaceId) ?? null;
    return {
      workspaceId: String(row.workspace_id),
      runId: String(row.run_id),
      lastOffset: Number(row.last_offset ?? 0),
      ...(row.last_capture_hash != null ? { lastCaptureHash: String(row.last_capture_hash) } : {}),
      ...(row.exit_code != null ? { exitCode: Number(row.exit_code) } : {}),
      finished: Boolean(row.finished),
      updatedAt: toIso(row.updated_at),
    };
  }

  // --- conductor_reconcile_findings (truthful orphan audit) ---
  async function recordReconcileFinding(input: PersistReconcileFindingInput): Promise<void> {
    const view: ReconcileFindingView = {
      findingId: input.findingId,
      ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
      kind: input.kind,
      ...(input.sessionName !== undefined ? { sessionName: input.sessionName } : {}),
      ...(input.worktreePath !== undefined ? { worktreePath: input.worktreePath } : {}),
      detail: input.detail ?? {},
      observedAt: new Date().toISOString(),
      resolved: false,
    };
    memFindings.push(view);
    if (durable()) {
      await executor.mutate(
        `insert into conductor_reconcile_findings
           (finding_id, workspace_id, kind, session_name, worktree_path, detail, observed_at, resolved)
         values (:finding_id, :workspace_id, :kind, :session_name, :worktree_path, cast(:detail as jsonb), now(), false)
         on conflict (finding_id) do nothing`,
        {
          finding_id: input.findingId,
          workspace_id: input.workspaceId ?? null,
          kind: input.kind,
          session_name: input.sessionName ?? null,
          worktree_path: input.worktreePath ?? null,
          detail: JSON.stringify(input.detail ?? {}),
        },
      );
    }
  }

  async function listReconcileFindings(
    workspaceId?: string,
  ): Promise<readonly ReconcileFindingView[]> {
    if (!durable()) {
      return workspaceId ? memFindings.filter((f) => f.workspaceId === workspaceId) : [...memFindings];
    }
    const rows = workspaceId
      ? await executor.execute<QueryRow>(
          `select * from conductor_reconcile_findings where workspace_id = :id order by observed_at desc`,
          { id: workspaceId },
        )
      : await executor.execute<QueryRow>(
          `select * from conductor_reconcile_findings order by observed_at desc`,
        );
    return rows.map(decodeFinding);
  }

  return {
    upsertWorkspace,
    getWorkspace,
    listWorkspaces,
    upsertRun,
    listRuns,
    appendEvent,
    listEvents,
    listTasks,
    persistTailCursor,
    getTailCursor,
    recordReconcileFinding,
    listReconcileFindings,
    isDurable: canonicalDurable,
  };
}

/** Decode the full `Workspace` domain object out of the stored `metadata` jsonb. */
function decodeWorkspace(metadata: unknown): Workspace | null {
  const obj = coerceObject(metadata);
  if (!obj) return null;
  const domain = obj[DOMAIN_KEY];
  const ws = coerceObject(domain);
  if (ws && typeof ws.workspaceId === 'string') return ws as unknown as Workspace;
  return null;
}

function decodeFinding(row: QueryRow): ReconcileFindingView {
  return {
    findingId: String(row.finding_id),
    ...(row.workspace_id != null ? { workspaceId: String(row.workspace_id) } : {}),
    kind: String(row.kind) as ReconcileFindingView['kind'],
    ...(row.session_name != null ? { sessionName: String(row.session_name) } : {}),
    ...(row.worktree_path != null ? { worktreePath: String(row.worktree_path) } : {}),
    detail: (coerceObject(row.detail) ?? {}) as Record<string, unknown>,
    observedAt: toIso(row.observed_at),
    resolved: Boolean(row.resolved),
  };
}

/** Coerce a jsonb column (object or JSON string) into a plain record, or null. */
function coerceObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
