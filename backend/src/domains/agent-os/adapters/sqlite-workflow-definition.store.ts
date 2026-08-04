/**
 * `SqliteWorkflowDefinitionStore` — the DURABLE embedded driver behind the
 * {@link WorkflowDefinitionStore} seam for the DB-less desktop (solo mode).
 * Closes the durability gap: under the sqlite state-of-record, workflow
 * definitions now SURVIVE restart instead of being lost with the in-memory Map.
 *
 * Shape mirrors {@link SqliteAgentOsRepository}: one better-sqlite3 table
 * (`id TEXT PRIMARY KEY, json TEXT, updated_at INTEGER`), WAL + busy timeout so
 * a SECOND connection onto the SAME state-of-record file (the agent-os repo
 * already holds one) writes without `SQLITE_BUSY` storms. All methods are SYNC
 * (better-sqlite3) — legal under the store's `T | Promise<T>` signatures.
 *
 * Contract parity with the pg + in-memory stores (proven by the restart e2e):
 *  - `upsert` is last-write-wins (SQLite upsert keeps the original rowid, so
 *    `ORDER BY rowid` stays first-insert order — parity with `Map.set`);
 *  - `get` returns the stored definition or `null`;
 *  - `list` preserves insertion order;
 *  - `delete` reports whether a row was removed.
 *
 * Degrade posture: NEVER fakes success — a failed open surfaces through the
 * composer's `tryCreate` seam (degrade to in-memory with a truthful warn), and
 * an I/O error at query time throws rather than swallowing.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { WorkflowDefinition } from '@recoder/agent-workflows';
import type { Logger } from '../../../shared/logger.js';
import type { WorkflowDefinitionStore } from '../services/workflow.service.js';

interface JsonRow {
  json: string;
}

export class SqliteWorkflowDefinitionStore implements WorkflowDefinitionStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    // First boot on a fresh desktop: the data dir may not exist yet.
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(
      `create table if not exists agentos_workflow_definitions (
         id text primary key,
         json text not null,
         updated_at integer not null
       )`,
    );
  }

  close(): void {
    if (this.db.open) this.db.close();
  }

  upsert(definition: WorkflowDefinition): WorkflowDefinition {
    this.db
      .prepare(
        `insert into agentos_workflow_definitions (id, json, updated_at) values (?, ?, ?)
         on conflict(id) do update set json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(definition.workflowId, JSON.stringify(definition), Date.now());
    return definition;
  }

  get(workflowId: string): WorkflowDefinition | null {
    const row = this.db
      .prepare<[string], JsonRow>(`select json from agentos_workflow_definitions where id = ?`)
      .get(workflowId);
    return row ? (JSON.parse(row.json) as WorkflowDefinition) : null;
  }

  list(): WorkflowDefinition[] {
    return this.db
      .prepare<[], JsonRow>(`select json from agentos_workflow_definitions order by rowid`)
      .all()
      .map((row) => JSON.parse(row.json) as WorkflowDefinition);
  }

  delete(workflowId: string): boolean {
    const result = this.db
      .prepare(`delete from agentos_workflow_definitions where id = ?`)
      .run(workflowId);
    return result.changes > 0;
  }
}

/**
 * Composer seam: open the sqlite workflow-definition store on the state-of-record
 * file, or `null` when it is unopenable — the composer then degrades to
 * in-memory with a truthful warn (never a crash, never a faked durable driver).
 */
export function tryCreateSqliteWorkflowDefinitionStore(
  dbPath: string,
  logger: Logger,
): SqliteWorkflowDefinitionStore | null {
  try {
    return new SqliteWorkflowDefinitionStore(dbPath);
  } catch (error) {
    logger.warn(
      { dbPath, error: error instanceof Error ? error.message : String(error) },
      'agent-os: sqlite workflow-definition store failed to open — degrading to in-memory',
    );
    return null;
  }
}
