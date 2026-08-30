/**
 * Adopt Crystal sessions into Recoder's canonical workspace board.
 *
 * Crystal remains a donor, not a second runtime: this service opens its local
 * sqlite database READ-ONLY, discovers the git worktrees it already created,
 * and persists selected sessions as ordinary Recoder workspaces. From that
 * point onward Review / Continue / Merge are owned by Recoder's conductor.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
import type { RunEvent, TaskRun, Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { WorkspaceRepositoryPort } from '../ports/workspace-repository.port.js';

interface CrystalRow {
  session_id: unknown;
  session_name: unknown;
  initial_prompt: unknown;
  worktree_name: unknown;
  worktree_path: unknown;
  status: unknown;
  archived: unknown;
  created_at: unknown;
  updated_at: unknown;
  tool_type: unknown;
  base_branch: unknown;
  project_id: unknown;
  project_name: unknown;
  project_path: unknown;
  main_branch: unknown;
  claude_session_id: unknown;
}

interface TableColumnRow {
  name: string;
}

interface CrystalConversationRow {
  id: unknown;
  session_id: unknown;
  message_type: unknown;
  content: unknown;
  timestamp: unknown;
}

export interface CrystalSessionCandidate {
  readonly sessionId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectPath: string;
  readonly name: string;
  readonly prompt: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly baseRef: string;
  readonly runtimeId: string;
  readonly originalStatus: string;
  readonly claudeSessionId: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly importable: boolean;
  readonly imported: boolean;
  readonly reason?: string;
}

export interface CrystalMigrationView {
  readonly available: boolean;
  readonly databasePath: string;
  readonly candidates: readonly CrystalSessionCandidate[];
  readonly importableCount: number;
  readonly importedCount: number;
  readonly reason?: string;
}

export interface CrystalImportSkip {
  readonly sessionId: string;
  readonly reason: string;
}

export interface CrystalImportResult {
  readonly imported: readonly Workspace[];
  readonly skipped: readonly CrystalImportSkip[];
}

export interface CrystalMigrationServiceDeps {
  readonly repository: WorkspaceRepositoryPort;
  readonly logger: Logger;
  readonly databasePath?: string;
  readonly existsSync?: (path: string) => boolean;
  readonly homedir?: () => string;
}

export class CrystalMigrationService {
  private readonly repository: WorkspaceRepositoryPort;
  private readonly log: Logger;
  private readonly exists: (path: string) => boolean;
  private readonly databasePathOverride?: string;
  private readonly home: () => string;

  constructor(deps: CrystalMigrationServiceDeps) {
    this.repository = deps.repository;
    this.log = deps.logger;
    this.exists = deps.existsSync ?? existsSync;
    this.databasePathOverride = deps.databasePath;
    this.home = deps.homedir ?? homedir;
  }

  async scan(): Promise<CrystalMigrationView> {
    const databasePath = this.databasePath();
    if (!this.safeExists(databasePath)) {
      return {
        available: false,
        databasePath,
        candidates: [],
        importableCount: 0,
        importedCount: 0,
        reason: 'Crystal has no local session database yet.',
      };
    }

    try {
      const rows = this.readRows(databasePath);
      const existing = await this.repository.listWorkspaces();
      const candidates = rows.map(row => this.toCandidate(row, existing));
      return {
        available: true,
        databasePath,
        candidates,
        importableCount: candidates.filter(row => row.importable && !row.imported).length,
        importedCount: candidates.filter(row => row.imported).length,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Crystal sessions could not be read.';
      this.log.warn({ err, databasePath }, 'Crystal session discovery failed');
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
    sessionIds: readonly string[],
    createdBy: string,
  ): Promise<CrystalImportResult> {
    const requested = new Set(sessionIds.map(value => value.trim()).filter(Boolean));
    const view = await this.scan();
    if (!view.available) {
      return {
        imported: [],
        skipped: [...requested].map(sessionId => ({
          sessionId,
          reason: view.reason ?? 'Crystal is unavailable.',
        })),
      };
    }

    const byId = new Map(view.candidates.map(candidate => [candidate.sessionId, candidate]));
    const conversations = this.readConversationMessages(view.databasePath, [...requested]);
    const imported: Workspace[] = [];
    const skipped: CrystalImportSkip[] = [];

    for (const sessionId of requested) {
      const candidate = byId.get(sessionId);
      if (!candidate) {
        skipped.push({ sessionId, reason: 'Crystal session was not found.' });
        continue;
      }
      if (candidate.imported) {
        skipped.push({ sessionId, reason: 'Session is already in Recoder.' });
        continue;
      }
      if (!candidate.importable) {
        skipped.push({
          sessionId,
          reason: candidate.reason ?? 'Crystal worktree is unavailable.',
        });
        continue;
      }

      const workspace = this.workspaceFor(candidate, createdBy);
      imported.push(await this.repository.upsertWorkspace(workspace));
      await this.importConversation(
        workspace,
        candidate,
        conversations.get(sessionId) ?? [],
        createdBy,
      );
    }

    return { imported, skipped };
  }

  private databasePath(): string {
    if (this.databasePathOverride?.trim()) return this.databasePathOverride.trim();
    const configured = process.env.CRYSTAL_DIR?.trim();
    return join(configured || this.safeHome(), configured ? 'crystal.db' : '.crystal/crystal.db');
  }

  private readRows(databasePath: string): CrystalRow[] {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      db.pragma('query_only = ON');
      const sessionColumns = this.columns(db, 'sessions');
      const projectColumns = this.columns(db, 'projects');
      for (const required of ['id', 'name', 'worktree_path', 'project_id']) {
        if (!sessionColumns.has(required)) throw new Error(`Crystal sessions.${required} is missing.`);
      }
      for (const required of ['id', 'name', 'path']) {
        if (!projectColumns.has(required)) throw new Error(`Crystal projects.${required} is missing.`);
      }

      const s = (name: string, fallback = 'NULL') =>
        sessionColumns.has(name) ? `s."${name}"` : fallback;
      const p = (name: string, fallback = 'NULL') =>
        projectColumns.has(name) ? `p."${name}"` : fallback;
      const sql = `
        SELECT
          s."id" AS session_id,
          s."name" AS session_name,
          ${s('initial_prompt', "''")} AS initial_prompt,
          ${s('worktree_name', "''")} AS worktree_name,
          s."worktree_path" AS worktree_path,
          ${s('status', "''")} AS status,
          ${s('archived', '0')} AS archived,
          ${s('created_at', 'NULL')} AS created_at,
          ${s('updated_at', 'NULL')} AS updated_at,
          ${s('tool_type', "'claude'")} AS tool_type,
          ${s('base_branch', 'NULL')} AS base_branch,
          ${s('claude_session_id', 'NULL')} AS claude_session_id,
          p."id" AS project_id,
          p."name" AS project_name,
          p."path" AS project_path,
          ${p('main_branch', 'NULL')} AS main_branch
        FROM sessions s
        INNER JOIN projects p ON p."id" = s."project_id"
        ORDER BY ${s('updated_at', 's.rowid')} DESC
      `;
      return db.prepare<[], CrystalRow>(sql).all();
    } finally {
      db.close();
    }
  }

  private columns(db: Database.Database, table: 'sessions' | 'projects'): Set<string> {
    return new Set(
      db.prepare<[], TableColumnRow>(`PRAGMA table_info("${table}")`).all().map(row => row.name),
    );
  }

  /** Pull Crystal's durable chat turns, bounded per selected session. */
  private readConversationMessages(
    databasePath: string,
    sessionIds: readonly string[],
  ): Map<string, CrystalConversationRow[]> {
    const result = new Map<string, CrystalConversationRow[]>();
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      db.pragma('query_only = ON');
      const table = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversation_messages'",
      ).get();
      if (!table) return result;
      const columns = new Set(
        db.prepare<[], TableColumnRow>('PRAGMA table_info("conversation_messages")')
          .all()
          .map(row => row.name),
      );
      if (!['id', 'session_id', 'message_type', 'content'].every(name => columns.has(name))) {
        return result;
      }
      const hasTimestamp = columns.has('timestamp');
      const statement = db.prepare<[string], CrystalConversationRow>(`
        SELECT id, session_id, message_type, content,
               ${hasTimestamp ? 'timestamp' : 'NULL'} AS timestamp
        FROM conversation_messages
        WHERE session_id = ?
        ORDER BY ${hasTimestamp ? 'timestamp ASC,' : ''} id ASC
        LIMIT 1000
      `);
      for (const sessionId of sessionIds) {
        result.set(sessionId, statement.all(sessionId));
      }
      return result;
    } catch (err) {
      this.log.warn({ err, databasePath }, 'Crystal conversation import degraded to workspace-only');
      return result;
    } finally {
      db.close();
    }
  }

  private toCandidate(
    row: CrystalRow,
    existing: readonly Workspace[],
  ): CrystalSessionCandidate {
    const sessionId = text(row.session_id);
    const projectId = text(row.project_id);
    const projectPath = text(row.project_path);
    const worktreePath = text(row.worktree_path);
    const worktreePresent = worktreePath !== '' && this.safeExists(worktreePath);
    const imported = existing.some(workspace =>
      workspace.workspaceId === workspaceIdFor(sessionId) ||
      crystalSessionIdOf(workspace) === sessionId
    );
    const branch = text(row.worktree_name) || (worktreePath ? basename(worktreePath) : 'crystal-session');
    return {
      sessionId,
      projectId,
      projectName: text(row.project_name) || basename(projectPath) || 'Crystal project',
      projectPath,
      name: text(row.session_name) || branch,
      prompt: text(row.initial_prompt),
      worktreePath,
      branch,
      baseRef: text(row.base_branch) || text(row.main_branch) || 'HEAD',
      runtimeId: runtimeIdFor(text(row.tool_type)),
      originalStatus: text(row.status) || 'unknown',
      claudeSessionId: text(row.claude_session_id),
      archived: booleanValue(row.archived),
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
      importable: worktreePresent,
      imported,
      ...(!worktreePresent ? { reason: 'The Crystal worktree is no longer on this machine.' } : {}),
    };
  }

  private workspaceFor(candidate: CrystalSessionCandidate, createdBy: string): Workspace {
    return {
      workspaceId: workspaceIdFor(candidate.sessionId),
      spaceId: 'default',
      projectId: projectIdFor(candidate),
      taskId: `task_crystal_${digest(candidate.sessionId)}`,
      runId: `run_${workspaceIdFor(candidate.sessionId)}`,
      runtimeId: candidate.runtimeId,
      substrate: 'tmux_worktree',
      branch: candidate.branch,
      baseRef: candidate.baseRef,
      worktreePath: candidate.worktreePath,
      state: 'awaiting_review',
      createdBy,
      createdAt: candidate.createdAt,
      updatedAt: new Date().toISOString(),
      metadata: {
        title: candidate.name,
        prompt: candidate.prompt,
        lockScope: { repo: candidate.projectPath || candidate.worktreePath },
        importedFrom: 'crystal',
        crystal: {
          sessionId: candidate.sessionId,
          projectId: candidate.projectId,
          projectName: candidate.projectName,
          sessionName: candidate.name,
          originalStatus: candidate.originalStatus,
          claudeSessionId: candidate.claudeSessionId,
          archived: candidate.archived,
        },
      },
    };
  }

  /** Seed Recoder's native Session timeline with Crystal's existing conversation. */
  private async importConversation(
    workspace: Workspace,
    candidate: CrystalSessionCandidate,
    messages: readonly CrystalConversationRow[],
    createdBy: string,
  ): Promise<void> {
    const runId = `run_${workspace.workspaceId}`;
    const run: TaskRun = {
      runId,
      taskId: workspace.taskId,
      spaceId: workspace.spaceId,
      state: 'completed',
      assigneeAgentId: candidate.runtimeId,
      startedAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      completedAt: candidate.updatedAt,
      metadata: {
        workspaceId: workspace.workspaceId,
        runtimeId: candidate.runtimeId,
        importedFrom: 'crystal',
        crystalSessionId: candidate.sessionId,
      },
    };
    await this.repository.upsertRun(run);

    const events: RunEvent[] = [{
      eventId: `event_crystal_${digest(`${candidate.sessionId}:started`)}`,
      type: 'started',
      taskId: workspace.taskId,
      runId,
      agentId: candidate.runtimeId,
      message: `Imported Crystal session: ${candidate.name}`,
      createdAt: candidate.createdAt,
      data: { source: 'crystal' },
    }];
    if (messages.length === 0 && candidate.prompt) {
      events.push({
        eventId: `event_crystal_${digest(`${candidate.sessionId}:initial-prompt`)}`,
        type: 'user_message',
        taskId: workspace.taskId,
        runId,
        agentId: createdBy,
        message: candidate.prompt,
        createdAt: candidate.createdAt,
        data: { source: 'crystal', role: 'user' },
      });
    }
    for (const row of messages) {
      const role = text(row.message_type) === 'user' ? 'user' : 'assistant';
      const message = text(row.content);
      if (!message) continue;
      events.push({
        eventId: `event_crystal_${digest(`${candidate.sessionId}:${text(row.id)}:${role}`)}`,
        type: role === 'user' ? 'user_message' : 'log',
        taskId: workspace.taskId,
        runId,
        agentId: role === 'user' ? createdBy : candidate.runtimeId,
        message,
        createdAt: timestamp(row.timestamp || candidate.updatedAt),
        data: { source: 'crystal', role },
      });
    }
    events.push({
      eventId: `event_crystal_${digest(`${candidate.sessionId}:completed`)}`,
      type: 'completed',
      taskId: workspace.taskId,
      runId,
      agentId: candidate.runtimeId,
      message: `Crystal session ended as ${candidate.originalStatus}.`,
      createdAt: candidate.updatedAt,
      data: { source: 'crystal', originalStatus: candidate.originalStatus },
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

function workspaceIdFor(sessionId: string): string {
  return `workspace_crystal_${digest(sessionId)}`;
}

function projectIdFor(candidate: CrystalSessionCandidate): string {
  const slug = candidate.projectName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `crystal-${digest(candidate.projectId || candidate.projectPath).slice(0, 8)}`;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function timestamp(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1_000 : value;
    return new Date(millis).toISOString();
  }
  const raw = text(value);
  const millis = Date.parse(raw);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : new Date().toISOString();
}

function runtimeIdFor(toolType: string): string {
  switch (toolType.toLowerCase()) {
    case 'codex':
      return 'codex';
    case 'claude':
    case 'claude_code':
    default:
      return 'claude_code';
  }
}

function crystalSessionIdOf(workspace: Workspace): string {
  const crystal = workspace.metadata?.crystal;
  if (!crystal || typeof crystal !== 'object' || Array.isArray(crystal)) return '';
  return text((crystal as Record<string, unknown>).sessionId);
}
