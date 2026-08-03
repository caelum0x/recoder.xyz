/**
 * `createSqliteWorkspaceRepository` — the conductor's {@link WorkspaceRepositoryPort}
 * over the SAME embedded sqlite file as the agent-os state-of-record (DB-less
 * desktop). Mirrors the pg adapter's ownership split byte-for-byte:
 *
 *  - conductor-owned tables persisted HERE: `conductor_workspaces`,
 *    `conductor_run_tails`, `conductor_reconcile_findings` — so workspaces, the
 *    tail resume cursor, and the reconcile audit survive a restart.
 *  - canonical TaskRun / RunEvent / TaskSpec reads+writes delegate to the
 *    injected {@link CanonicalRunStore} (the sqlite `AgentOsRepositoryPort`,
 *    bound at the composition root over the SAME file). Absent (tests) ⇒ a
 *    bounded in-process fallback and `isDurable() === false`, truthfully.
 *
 * A second connection onto the agent-os file is safe: both open WAL + a busy
 * timeout. All sqlite calls are sync (better-sqlite3) inside async methods.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { RunEvent, TaskRun, TaskSpec, Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type {
  CanonicalRunStore,
  PersistReconcileFindingInput,
  PersistRunTailInput,
  RunTailCursor,
  WorkspaceRepositoryPort,
} from '../ports/workspace-repository.port.js';
import type { ReconcileFindingView } from '../types.js';

export interface SqliteWorkspaceRepositoryDeps {
  /** The sqlite file — the SAME file the agent-os state-of-record opened. */
  readonly path: string;
  /**
   * The DURABLE agent-os canonical store (sqlite driver) for TaskRun / RunEvent /
   * TaskSpec. Absent ⇒ bounded in-process fallback, `isDurable()` false.
   */
  readonly canonicalStore?: CanonicalRunStore;
}

export type SqliteWorkspaceRepository = WorkspaceRepositoryPort & { close(): void };

interface JsonRow {
  json: string;
}

export function createSqliteWorkspaceRepository(
  deps: SqliteWorkspaceRepositoryDeps,
): SqliteWorkspaceRepository {
  const { canonicalStore } = deps;
  mkdirSync(dirname(deps.path), { recursive: true });
  const db = new Database(deps.path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(
    `create table if not exists conductor_workspaces (
       workspace_id text primary key,
       json text not null,
       updated_at integer not null
     );
     create table if not exists conductor_run_tails (
       workspace_id text primary key,
       run_id text not null,
       last_offset integer not null,
       last_capture_hash text,
       exit_code integer,
       finished integer not null,
       updated_at text not null
     );
     create table if not exists conductor_reconcile_findings (
       finding_id text primary key,
       workspace_id text,
       kind text not null,
       session_name text,
       worktree_path text,
       detail text not null,
       observed_at text not null,
       resolved integer not null
     )`,
  );

  // In-process fallback for the canonical agent-os tables when no store is bound.
  const memRuns = new Map<string, TaskRun>();
  const memEvents: RunEvent[] = [];
  const memTasks = new Map<string, TaskSpec>();

  async function upsertWorkspace(workspace: Workspace): Promise<Workspace> {
    db.prepare(
      `insert into conductor_workspaces (workspace_id, json, updated_at) values (?, ?, ?)
       on conflict(workspace_id) do update set json = excluded.json, updated_at = excluded.updated_at`,
    ).run(workspace.workspaceId, JSON.stringify(workspace), Date.now());
    return workspace;
  }

  async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
    const row = db
      .prepare<[string], JsonRow>(`select json from conductor_workspaces where workspace_id = ?`)
      .get(workspaceId);
    return row ? (JSON.parse(row.json) as Workspace) : null;
  }

  async function listWorkspaces(): Promise<Workspace[]> {
    return db
      .prepare<[], JsonRow>(`select json from conductor_workspaces order by rowid desc`)
      .all()
      .map((row) => JSON.parse(row.json) as Workspace);
  }

  // --- canonical agent-os tables: durable via the injected sqlite store. ---
  async function upsertRun(run: TaskRun): Promise<TaskRun> {
    if (canonicalStore) return canonicalStore.upsertRun(run);
    memRuns.set(run.runId, run);
    return run;
  }
  async function listRuns(): Promise<TaskRun[]> {
    if (canonicalStore) return canonicalStore.listRuns();
    return [...memRuns.values()];
  }
  async function appendEvent(event: RunEvent): Promise<RunEvent> {
    if (canonicalStore) return canonicalStore.appendEvent(event);
    memEvents.push(event);
    return event;
  }
  async function listEvents(): Promise<RunEvent[]> {
    if (canonicalStore) return canonicalStore.listEvents();
    return [...memEvents];
  }
  async function listTasks(): Promise<TaskSpec[]> {
    if (canonicalStore) return canonicalStore.listTasks();
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
    db.prepare(
      `insert into conductor_run_tails
         (workspace_id, run_id, last_offset, last_capture_hash, exit_code, finished, updated_at)
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict(workspace_id) do update set
         run_id = excluded.run_id,
         last_offset = excluded.last_offset,
         last_capture_hash = excluded.last_capture_hash,
         exit_code = excluded.exit_code,
         finished = excluded.finished,
         updated_at = excluded.updated_at`,
    ).run(
      cursor.workspaceId,
      cursor.runId,
      cursor.lastOffset,
      cursor.lastCaptureHash ?? null,
      cursor.exitCode ?? null,
      cursor.finished ? 1 : 0,
      cursor.updatedAt,
    );
    return cursor;
  }

  async function getTailCursor(workspaceId: string): Promise<RunTailCursor | null> {
    const row = db
      .prepare<[string], Record<string, unknown>>(
        `select workspace_id, run_id, last_offset, last_capture_hash, exit_code, finished, updated_at
           from conductor_run_tails where workspace_id = ?`,
      )
      .get(workspaceId);
    if (!row) return null;
    return {
      workspaceId: String(row.workspace_id),
      runId: String(row.run_id),
      lastOffset: Number(row.last_offset ?? 0),
      ...(row.last_capture_hash != null ? { lastCaptureHash: String(row.last_capture_hash) } : {}),
      ...(row.exit_code != null ? { exitCode: Number(row.exit_code) } : {}),
      finished: Boolean(row.finished),
      updatedAt: String(row.updated_at),
    };
  }

  // --- conductor_reconcile_findings (truthful orphan audit) ---
  async function recordReconcileFinding(input: PersistReconcileFindingInput): Promise<void> {
    db.prepare(
      `insert into conductor_reconcile_findings
         (finding_id, workspace_id, kind, session_name, worktree_path, detail, observed_at, resolved)
       values (?, ?, ?, ?, ?, ?, ?, 0)
       on conflict(finding_id) do nothing`,
    ).run(
      input.findingId,
      input.workspaceId ?? null,
      input.kind,
      input.sessionName ?? null,
      input.worktreePath ?? null,
      JSON.stringify(input.detail ?? {}),
      new Date().toISOString(),
    );
  }

  async function listReconcileFindings(
    workspaceId?: string,
  ): Promise<readonly ReconcileFindingView[]> {
    const rows = workspaceId
      ? db
          .prepare<[string], Record<string, unknown>>(
            `select * from conductor_reconcile_findings where workspace_id = ? order by observed_at desc`,
          )
          .all(workspaceId)
      : db
          .prepare<[], Record<string, unknown>>(
            `select * from conductor_reconcile_findings order by observed_at desc`,
          )
          .all();
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
    // The conductor tables are always durable here; the canonical run/event
    // read-model is durable exactly when the agent-os sqlite store is bound.
    isDurable: () => Boolean(canonicalStore),
    close: () => {
      if (db.open) db.close();
    },
  };
}

/**
 * Composer seam: open the sqlite workspace repository, or `null` when the file
 * is unopenable — the composer then falls back to the executor-backed default
 * with a truthful warn (never a crash).
 */
export function tryCreateSqliteWorkspaceRepository(
  deps: SqliteWorkspaceRepositoryDeps,
  logger: Logger,
): SqliteWorkspaceRepository | null {
  try {
    return createSqliteWorkspaceRepository(deps);
  } catch (error) {
    logger.warn(
      { path: deps.path, error: error instanceof Error ? error.message : String(error) },
      'conductor: sqlite workspace repository failed to open — falling back to executor-backed repository',
    );
    return null;
  }
}

function decodeFinding(row: Record<string, unknown>): ReconcileFindingView {
  let detail: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.detail ?? '{}'));
    if (parsed && typeof parsed === 'object') detail = parsed as Record<string, unknown>;
  } catch {
    // WHY swallow: a corrupt detail blob must not make the audit list unreadable.
  }
  return {
    findingId: String(row.finding_id),
    ...(row.workspace_id != null ? { workspaceId: String(row.workspace_id) } : {}),
    kind: String(row.kind) as ReconcileFindingView['kind'],
    ...(row.session_name != null ? { sessionName: String(row.session_name) } : {}),
    ...(row.worktree_path != null ? { worktreePath: String(row.worktree_path) } : {}),
    detail,
    observedAt: String(row.observed_at),
    resolved: Boolean(row.resolved),
  };
}
