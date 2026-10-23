/**
 * Adopt Vibe Kanban tasks/workspaces into Recoder's canonical workspace board.
 *
 * Vibe Kanban (bloop, Y Combinator-backed) shut down 2026-04-10 and is
 * community-maintained from an Apache-2.0 fork with no vendor behind it. Its
 * local app stores every task/worktree in a single-file SQLite database this
 * service opens READ-ONLY, discovers the git worktrees it already created, and
 * persists selected attempts as ordinary Recoder workspaces — same shape as
 * `crystal-migration.service.ts`, a different donor schema.
 *
 * Schema targeted is Vibe Kanban's last pre-shutdown layout (migrations through
 * 2026-03-17): `tasks` -> `workspaces` (one row per "attempt"/worktree, FK to
 * `tasks`) -> `sessions` (one row per executor run, FK to `workspaces`) ->
 * `coding_agent_turns` (prompt/summary per turn). Repo location comes from the
 * `workspace_repos` junction -> `repos.path`, with a fallback to the older
 * `projects.git_repo_path` column for installs that never ran the Dec-2025
 * multi-repo migration. Every lookup is column-probed via `PRAGMA table_info`
 * so a slightly different on-disk schema version degrades a field to NULL
 * instead of throwing.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { RunEvent, TaskRun, Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { WorkspaceRepositoryPort } from '../ports/workspace-repository.port.js';

interface VibeKanbanWorkspaceRow {
  workspace_id: unknown;
  task_id: unknown;
  container_ref: unknown;
  branch: unknown;
  archived: unknown;
  worktree_deleted: unknown;
  workspace_name: unknown;
  workspace_created_at: unknown;
  workspace_updated_at: unknown;
  project_id: unknown;
  title: unknown;
  description: unknown;
  status: unknown;
}

interface TableColumnRow {
  name: string;
}

interface RepoLookupRow {
  workspace_id: unknown;
  repo_path: unknown;
  target_branch: unknown;
}

interface ProjectLookupRow {
  project_id: unknown;
  project_name: unknown;
  legacy_repo_path: unknown;
}

interface SessionTurnRow {
  turn_id: unknown;
  executor: unknown;
  prompt: unknown;
  summary: unknown;
  created_at: unknown;
}

export interface VibeKanbanWorkspaceCandidate {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly repoPath: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly branch: string;
  readonly baseRef: string;
  readonly containerRef: string;
  readonly runtimeId: string;
  readonly executor: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly importable: boolean;
  readonly imported: boolean;
  readonly reason?: string;
}

export interface VibeKanbanMigrationView {
  readonly available: boolean;
  readonly databasePath: string;
  readonly candidates: readonly VibeKanbanWorkspaceCandidate[];
  readonly importableCount: number;
  readonly importedCount: number;
  readonly reason?: string;
}

export interface VibeKanbanImportSkip {
  readonly workspaceId: string;
  readonly reason: string;
}

export interface VibeKanbanImportResult {
  readonly imported: readonly Workspace[];
  readonly skipped: readonly VibeKanbanImportSkip[];
}

export interface VibeKanbanMigrationServiceDeps {
  readonly repository: WorkspaceRepositoryPort;
  readonly logger: Logger;
  readonly databasePath?: string;
  readonly existsSync?: (path: string) => boolean;
  readonly homedir?: () => string;
  readonly platform?: () => string;
  readonly env?: Record<string, string | undefined>;
}

export class VibeKanbanMigrationService {
  private readonly repository: WorkspaceRepositoryPort;
  private readonly log: Logger;
  private readonly exists: (path: string) => boolean;
  private readonly databasePathOverride?: string;
  private readonly home: () => string;
  private readonly plat: () => string;
  private readonly env: Record<string, string | undefined>;

  constructor(deps: VibeKanbanMigrationServiceDeps) {
    this.repository = deps.repository;
    this.log = deps.logger;
    this.exists = deps.existsSync ?? existsSync;
    this.databasePathOverride = deps.databasePath;
    this.home = deps.homedir ?? homedir;
    this.plat = deps.platform ?? platform;
    this.env = deps.env ?? process.env;
  }

  async scan(): Promise<VibeKanbanMigrationView> {
    const databasePath = this.databasePath();
    if (!this.safeExists(databasePath)) {
      return {
        available: false,
        databasePath,
        candidates: [],
        importableCount: 0,
        importedCount: 0,
        reason: 'Vibe Kanban has no local task database on this machine.',
      };
    }

    try {
      const existing = await this.repository.listWorkspaces();
      const candidates = this.readCandidates(databasePath, existing);
      return {
        available: true,
        databasePath,
        candidates,
        importableCount: candidates.filter(row => row.importable && !row.imported).length,
        importedCount: candidates.filter(row => row.imported).length,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Vibe Kanban tasks could not be read.';
      this.log.warn({ err, databasePath }, 'Vibe Kanban task discovery failed');
      return {
        available: false,
        databasePath,
        candidates: [],
        importableCount: 0,
        importedCount: 0,
        reason,
      };
    }
  }

  async importSessions(
    workspaceIds: readonly string[],
    createdBy: string,
  ): Promise<VibeKanbanImportResult> {
    const requested = new Set(workspaceIds.map(value => value.trim()).filter(Boolean));
    const view = await this.scan();
    if (!view.available) {
      return {
        imported: [],
        skipped: [...requested].map(workspaceId => ({
          workspaceId,
          reason: view.reason ?? 'Vibe Kanban is unavailable.',
        })),
      };
    }

    const byId = new Map(view.candidates.map(candidate => [candidate.workspaceId, candidate]));
    const turns = this.readTurns(view.databasePath, [...requested]);
    const imported: Workspace[] = [];
    const skipped: VibeKanbanImportSkip[] = [];

    for (const workspaceId of requested) {
      const candidate = byId.get(workspaceId);
      if (!candidate) {
        skipped.push({ workspaceId, reason: 'Vibe Kanban workspace was not found.' });
        continue;
      }
      if (candidate.imported) {
        skipped.push({ workspaceId, reason: 'Workspace is already in Recoder.' });
        continue;
      }
      if (!candidate.importable) {
        skipped.push({
          workspaceId,
          reason: candidate.reason ?? 'Vibe Kanban worktree is unavailable.',
        });
        continue;
      }

      const workspace = this.workspaceFor(candidate, createdBy);
      imported.push(await this.repository.upsertWorkspace(workspace));
      await this.importTimeline(workspace, candidate, turns.get(workspaceId) ?? [], createdBy);
    }

    return { imported, skipped };
  }

  private databasePath(): string {
    if (this.databasePathOverride?.trim()) return this.databasePathOverride.trim();
    const configured = this.env.VIBE_KANBAN_DB?.trim();
    if (configured) return configured;

    const home = this.safeHome();
    const fileName = 'db.v2.sqlite';
    switch (this.plat()) {
      case 'darwin':
        return join(home, 'Library', 'Application Support', 'ai.bloop.vibe-kanban', fileName);
      case 'win32': {
        const roaming = this.env.APPDATA?.trim() || join(home, 'AppData', 'Roaming');
        return join(roaming, 'bloop', 'vibe-kanban', 'data', fileName);
      }
      default: {
        const xdg = this.env.XDG_DATA_HOME?.trim();
        return join(xdg || join(home, '.local', 'share'), 'vibe-kanban', fileName);
      }
    }
  }

  private readCandidates(
    databasePath: string,
    existing: readonly Workspace[],
  ): VibeKanbanWorkspaceCandidate[] {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      db.pragma('query_only = ON');
      const tables = this.tableNames(db);
      if (!tables.has('workspaces') || !tables.has('tasks')) {
        throw new Error('Vibe Kanban database is missing the workspaces/tasks tables.');
      }

      const workspaceColumns = this.columns(db, 'workspaces');
      const taskColumns = this.columns(db, 'tasks');
      for (const required of ['id', 'task_id']) {
        if (!workspaceColumns.has(required)) {
          throw new Error(`Vibe Kanban workspaces.${required} is missing.`);
        }
      }
      for (const required of ['id', 'project_id', 'title']) {
        if (!taskColumns.has(required)) throw new Error(`Vibe Kanban tasks.${required} is missing.`);
      }

      const w = (name: string, fallback = 'NULL') =>
        workspaceColumns.has(name) ? `w."${name}"` : fallback;
      const t = (name: string, fallback = 'NULL') => (taskColumns.has(name) ? `t."${name}"` : fallback);

      const rows = db
        .prepare<[], VibeKanbanWorkspaceRow>(
          `
          SELECT
            w."id" AS workspace_id,
            w."task_id" AS task_id,
            ${w('container_ref', w('worktree_path', "''"))} AS container_ref,
            ${w('branch', "''")} AS branch,
            ${w('archived', '0')} AS archived,
            ${w('worktree_deleted', '0')} AS worktree_deleted,
            ${w('name', 'NULL')} AS workspace_name,
            ${w('created_at', 'NULL')} AS workspace_created_at,
            ${w('updated_at', 'NULL')} AS workspace_updated_at,
            t."project_id" AS project_id,
            t."title" AS title,
            ${t('description', "''")} AS description,
            ${t('status', "'todo'")} AS status
          FROM workspaces w
          JOIN tasks t ON t."id" = w."task_id"
          ORDER BY ${w('updated_at', 'w.rowid')} DESC
          `,
        )
        .all();

      const repoByWorkspace = this.readRepoLookup(db, tables);
      const projectById = this.readProjectLookup(db, tables);

      return rows.map(row => this.toCandidate(row, repoByWorkspace, projectById, existing));
    } finally {
      db.close();
    }
  }

  /** Per-workspace repo path + target branch, via `workspace_repos` -> `repos`. */
  private readRepoLookup(
    db: Database.Database,
    tables: Set<string>,
  ): Map<string, { repoPath: string; targetBranch: string }> {
    const result = new Map<string, { repoPath: string; targetBranch: string }>();
    if (!tables.has('workspace_repos') || !tables.has('repos')) return result;
    const junctionColumns = this.columns(db, 'workspace_repos');
    const repoColumns = this.columns(db, 'repos');
    if (!junctionColumns.has('workspace_id') || !junctionColumns.has('repo_id')) return result;
    if (!repoColumns.has('id') || !repoColumns.has('path')) return result;
    const targetBranchExpr = junctionColumns.has('target_branch') ? 'wr."target_branch"' : 'NULL';
    try {
      const rows = db
        .prepare<[], RepoLookupRow>(
          `
          SELECT wr."workspace_id" AS workspace_id, r."path" AS repo_path,
                 ${targetBranchExpr} AS target_branch
          FROM workspace_repos wr
          JOIN repos r ON r."id" = wr."repo_id"
          `,
        )
        .all();
      for (const row of rows) {
        const key = blobHex(row.workspace_id);
        if (!key || result.has(key)) continue;
        result.set(key, { repoPath: text(row.repo_path), targetBranch: text(row.target_branch) });
      }
    } catch (err) {
      this.log.warn({ err }, 'Vibe Kanban repo lookup degraded');
    }
    return result;
  }

  /** Project name + (legacy, pre-multi-repo) repo path keyed by project id. */
  private readProjectLookup(
    db: Database.Database,
    tables: Set<string>,
  ): Map<string, { projectName: string; legacyRepoPath: string }> {
    const result = new Map<string, { projectName: string; legacyRepoPath: string }>();
    if (!tables.has('projects')) return result;
    const projectColumns = this.columns(db, 'projects');
    if (!projectColumns.has('id') || !projectColumns.has('name')) return result;
    const legacyPathExpr = projectColumns.has('git_repo_path') ? 'p."git_repo_path"' : 'NULL';
    try {
      const rows = db
        .prepare<[], ProjectLookupRow>(
          `SELECT p."id" AS project_id, p."name" AS project_name, ${legacyPathExpr} AS legacy_repo_path FROM projects p`,
        )
        .all();
      for (const row of rows) {
        const key = blobHex(row.project_id);
        if (!key) continue;
        result.set(key, {
          projectName: text(row.project_name),
          legacyRepoPath: text(row.legacy_repo_path),
        });
      }
    } catch (err) {
      this.log.warn({ err }, 'Vibe Kanban project lookup degraded');
    }
    return result;
  }

  private tableNames(db: Database.Database): Set<string> {
    return new Set(
      db
        .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map(row => row.name),
    );
  }

  private columns(db: Database.Database, table: string): Set<string> {
    return new Set(
      db.prepare<[], TableColumnRow>(`PRAGMA table_info("${table}")`).all().map(row => row.name),
    );
  }

  /** Pull coding_agent_turns (prompt/summary) for the sessions attached to selected workspaces. */
  private readTurns(
    databasePath: string,
    workspaceIds: readonly string[],
  ): Map<string, SessionTurnRow[]> {
    const result = new Map<string, SessionTurnRow[]>();
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      db.pragma('query_only = ON');
      const tables = this.tableNames(db);
      if (!tables.has('sessions') || !tables.has('coding_agent_turns')) return result;
      const sessionColumns = this.columns(db, 'sessions');
      const turnColumns = this.columns(db, 'coding_agent_turns');
      if (!sessionColumns.has('id') || !sessionColumns.has('workspace_id')) return result;
      if (!turnColumns.has('id') || !turnColumns.has('execution_process_id')) return result;
      // Turns hang off execution_processes, which hang off sessions — walk the join
      // and bucket the output under the owning workspace id (hex) so lookups below
      // are a plain map get.
      const executorExpr = sessionColumns.has('executor') ? 's."executor"' : 'NULL';
      const summaryExpr = turnColumns.has('summary') ? 'ct."summary"' : 'NULL';
      const createdAtExpr = turnColumns.has('created_at') ? 'ct."created_at"' : 'NULL';
      const hasExecutionProcesses = tables.has('execution_processes');
      if (!hasExecutionProcesses) return result;
      const rows = db
        .prepare<
          [],
          { workspace_id: unknown; turn_id: unknown; executor: unknown; prompt: unknown; summary: unknown; created_at: unknown }
        >(
          `
          SELECT s."workspace_id" AS workspace_id, ct."id" AS turn_id, ${executorExpr} AS executor,
                 ct."prompt" AS prompt, ${summaryExpr} AS summary, ${createdAtExpr} AS created_at
          FROM coding_agent_turns ct
          JOIN execution_processes ep ON ep."id" = ct."execution_process_id"
          JOIN sessions s ON s."id" = ep."session_id"
          ORDER BY ct."rowid" ASC
          `,
        )
        .all();
      for (const row of rows) {
        const key = blobHex(row.workspace_id);
        if (!key || !workspaceIds.includes(key)) continue;
        const bucket = result.get(key) ?? [];
        bucket.push({
          turn_id: row.turn_id,
          executor: row.executor,
          prompt: row.prompt,
          summary: row.summary,
          created_at: row.created_at,
        });
        result.set(key, bucket);
      }
      return result;
    } catch (err) {
      this.log.warn({ err, databasePath }, 'Vibe Kanban turn import degraded to workspace-only');
      return result;
    } finally {
      db.close();
    }
  }

  private toCandidate(
    row: VibeKanbanWorkspaceRow,
    repoByWorkspace: Map<string, { repoPath: string; targetBranch: string }>,
    projectById: Map<string, { projectName: string; legacyRepoPath: string }>,
    existing: readonly Workspace[],
  ): VibeKanbanWorkspaceCandidate {
    const workspaceId = blobHex(row.workspace_id);
    const taskId = blobHex(row.task_id);
    const projectId = blobHex(row.project_id);
    const project = projectById.get(projectId);
    const repo = repoByWorkspace.get(workspaceId);
    const repoPath = repo?.repoPath || project?.legacyRepoPath || '';
    const containerRef = text(row.container_ref);
    const worktreeDeleted = booleanValue(row.worktree_deleted);
    const containerPresent = !worktreeDeleted && containerRef !== '' && this.safeExists(containerRef);
    const imported = existing.some(
      workspace => workspace.workspaceId === workspaceIdFor(workspaceId),
    );
    const executor = ''; // backfilled below from the per-workspace session, if any
    return {
      workspaceId,
      taskId,
      projectId,
      projectName: project?.projectName || 'Vibe Kanban project',
      repoPath,
      title: text(row.title) || 'Imported Vibe Kanban task',
      description: text(row.description),
      status: text(row.status) || 'todo',
      branch: text(row.branch) || text(row.workspace_name) || 'vibe-kanban-task',
      baseRef: repo?.targetBranch || 'HEAD',
      containerRef,
      runtimeId: 'claude_code',
      executor,
      archived: booleanValue(row.archived),
      createdAt: timestamp(row.workspace_created_at),
      updatedAt: timestamp(row.workspace_updated_at),
      importable: containerPresent,
      imported,
      ...(!containerPresent
        ? {
            reason: worktreeDeleted
              ? 'Vibe Kanban already deleted this worktree.'
              : 'The Vibe Kanban worktree is no longer on this machine.',
          }
        : {}),
    };
  }

  private workspaceFor(candidate: VibeKanbanWorkspaceCandidate, createdBy: string): Workspace {
    return {
      workspaceId: workspaceIdFor(candidate.workspaceId),
      spaceId: 'default',
      projectId: projectIdFor(candidate),
      taskId: `task_vibekanban_${digest(candidate.taskId)}`,
      runId: `run_${workspaceIdFor(candidate.workspaceId)}`,
      runtimeId: candidate.runtimeId,
      substrate: 'tmux_worktree',
      branch: candidate.branch,
      baseRef: candidate.baseRef,
      worktreePath: candidate.containerRef,
      state: 'awaiting_review',
      createdBy,
      createdAt: candidate.createdAt,
      updatedAt: new Date().toISOString(),
      metadata: {
        title: candidate.title,
        prompt: candidate.description,
        lockScope: { repo: candidate.repoPath || candidate.containerRef },
        importedFrom: 'vibe_kanban',
        vibeKanban: {
          workspaceId: candidate.workspaceId,
          taskId: candidate.taskId,
          projectId: candidate.projectId,
          projectName: candidate.projectName,
          status: candidate.status,
          archived: candidate.archived,
        },
      },
    };
  }

  private async importTimeline(
    workspace: Workspace,
    candidate: VibeKanbanWorkspaceCandidate,
    turns: readonly SessionTurnRow[],
    createdBy: string,
  ): Promise<void> {
    const runId = `run_${workspace.workspaceId}`;
    const runtimeId = text(turns[0]?.executor) ? runtimeIdFor(text(turns[0]?.executor)) : candidate.runtimeId;
    const run: TaskRun = {
      runId,
      taskId: workspace.taskId,
      spaceId: workspace.spaceId,
      state: 'completed',
      assigneeAgentId: runtimeId,
      startedAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      completedAt: candidate.updatedAt,
      metadata: {
        workspaceId: workspace.workspaceId,
        runtimeId,
        importedFrom: 'vibe_kanban',
        vibeKanbanWorkspaceId: candidate.workspaceId,
      },
    };
    await this.repository.upsertRun(run);

    const events: RunEvent[] = [
      {
        eventId: `event_vibekanban_${digest(`${candidate.workspaceId}:started`)}`,
        type: 'started',
        taskId: workspace.taskId,
        runId,
        agentId: runtimeId,
        message: `Imported Vibe Kanban task: ${candidate.title}`,
        createdAt: candidate.createdAt,
        data: { source: 'vibe_kanban' },
      },
    ];
    if (turns.length === 0 && candidate.description) {
      events.push({
        eventId: `event_vibekanban_${digest(`${candidate.workspaceId}:description`)}`,
        type: 'user_message',
        taskId: workspace.taskId,
        runId,
        agentId: createdBy,
        message: candidate.description,
        createdAt: candidate.createdAt,
        data: { source: 'vibe_kanban', role: 'user' },
      });
    }
    for (const turn of turns) {
      const prompt = text(turn.prompt);
      if (prompt) {
        events.push({
          eventId: `event_vibekanban_${digest(`${candidate.workspaceId}:${text(turn.turn_id)}:prompt`)}`,
          type: 'user_message',
          taskId: workspace.taskId,
          runId,
          agentId: createdBy,
          message: prompt,
          createdAt: timestamp(turn.created_at || candidate.updatedAt),
          data: { source: 'vibe_kanban', role: 'user' },
        });
      }
      const summary = text(turn.summary);
      if (summary) {
        events.push({
          eventId: `event_vibekanban_${digest(`${candidate.workspaceId}:${text(turn.turn_id)}:summary`)}`,
          type: 'log',
          taskId: workspace.taskId,
          runId,
          agentId: runtimeIdFor(text(turn.executor)) || runtimeId,
          message: summary,
          createdAt: timestamp(turn.created_at || candidate.updatedAt),
          data: { source: 'vibe_kanban', role: 'assistant' },
        });
      }
    }
    events.push({
      eventId: `event_vibekanban_${digest(`${candidate.workspaceId}:completed`)}`,
      type: 'completed',
      taskId: workspace.taskId,
      runId,
      agentId: runtimeId,
      message: `Vibe Kanban task ended as ${candidate.status}.`,
      createdAt: candidate.updatedAt,
      data: { source: 'vibe_kanban', originalStatus: candidate.status },
    });
    for (const event of events) await this.repository.appendEvent(event);
  }

  private safeExists(path: string): boolean {
    try {
      return this.exists(path);
    } catch {
      return false;
    }
  }

  private safeHome(): string {
    try {
      return this.home();
    } catch {
      return '';
    }
  }
}

function workspaceIdFor(workspaceId: string): string {
  return `workspace_vibekanban_${digest(workspaceId)}`;
}

function projectIdFor(candidate: VibeKanbanWorkspaceCandidate): string {
  const slug = candidate.projectName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `vibekanban-${digest(candidate.projectId || candidate.repoPath).slice(0, 8)}`;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

/** Vibe Kanban's ids are SQLite BLOBs; better-sqlite3 returns those as Buffers. */
function blobHex(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString('hex');
  return text(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

/** SQLite's `datetime('now','subsec')` is UTC with a space separator, not ISO-8601. */
function timestamp(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1_000 : value;
    return new Date(millis).toISOString();
  }
  const raw = text(value);
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : new Date().toISOString();
}

function runtimeIdFor(executor: string): string {
  switch (executor.toUpperCase()) {
    case 'CLAUDE_CODE':
      return 'claude_code';
    case 'CODEX':
      return 'codex';
    case 'CURSOR_AGENT':
    case 'CURSOR':
      return 'cursor';
    case 'OPENCODE':
      return 'opencode';
    default:
      return 'claude_code';
  }
}
