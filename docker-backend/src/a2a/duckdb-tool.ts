/**
 * @module duckdb-tool
 *
 * In-process DuckDB data layer for A2A agents.
 *
 * Provides SQL-queryable in-memory tables per session with optional CSV/JSON ingest.
 * Results are automatically written to the scratchpad so other agents can read them.
 *
 * MCP tools exposed (via MCP server):
 *   recoder_query_data   — run SQL against the session's DuckDB instance
 *   recoder_load_csv     — ingest CSV content into a named table
 *   recoder_load_json    — ingest JSON array into a named table
 *
 * Each session gets its own isolated DuckDB in-memory database.
 * Sessions are evicted after 2h of inactivity (same TTL as scratchpad).
 */

import Database from 'duckdb';
import { logger } from '../logger.js';
import { scratchpadSet } from './scratchpad.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_RESULT_ROWS = 500;

interface SessionDb {
  db: InstanceType<typeof Database.Database>;
  con: Database.Connection;
  lastAccess: number;
}

const sessions = new Map<string, SessionDb>();

// ── TTL eviction ──────────────────────────────────────────────────────────────

function evictStale(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [sessionId, s] of sessions) {
    if (s.lastAccess < cutoff) {
      try { s.con.close(); } catch { /* ignore */ }
      try { s.db.close(); } catch { /* ignore */ }
      sessions.delete(sessionId);
      logger.debug({ sessionId }, '[duckdb] Evicted stale session');
    }
  }
}

setInterval(evictStale, 10 * 60 * 1000).unref();

// ── Session management ────────────────────────────────────────────────────────

function getSession(sessionId: string): SessionDb {
  let s = sessions.get(sessionId);
  if (!s) {
    const db = new Database.Database(':memory:');
    const con = db.connect();
    s = { db, con, lastAccess: Date.now() };
    sessions.set(sessionId, s);
    logger.debug({ sessionId }, '[duckdb] Created session database');
  }
  s.lastAccess = Date.now();
  return s;
}

// ── Query helper ──────────────────────────────────────────────────────────────

function runQuery(con: Database.Connection, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    con.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve((rows ?? []) as Record<string, unknown>[]);
    });
  });
}

function runExec(con: Database.Connection, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    con.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  columns: string[];
  truncated: boolean;
}

/**
 * Execute SQL against the session's DuckDB instance.
 * Results are written to scratchpad under `duckdb:{queryHash}`.
 */
export async function queryData(params: {
  sessionId: string;
  agentId: string;
  sql: string;
  scratchpadKey?: string;
}): Promise<QueryResult> {
  const { sessionId, agentId, sql, scratchpadKey } = params;
  const { con } = getSession(sessionId);

  const rows = await runQuery(con, sql);
  const truncated = rows.length > MAX_RESULT_ROWS;
  const sliced = truncated ? rows.slice(0, MAX_RESULT_ROWS) : rows;
  const columns = sliced.length > 0 ? Object.keys(sliced[0]) : [];

  const result: QueryResult = {
    rows: sliced,
    rowCount: rows.length,
    columns,
    truncated,
  };

  // Write to scratchpad if key provided
  if (scratchpadKey) {
    scratchpadSet({ sessionId, agentId, key: scratchpadKey, value: result });
  }

  logger.debug({ sessionId, rowCount: result.rowCount, truncated }, '[duckdb] Query executed');
  return result;
}

/**
 * Ingest CSV content into a named table. Creates or replaces the table.
 * Content can be raw CSV string or a URL to fetch.
 */
export async function loadCsv(params: {
  sessionId: string;
  agentId: string;
  tableName: string;
  csvContent: string;
  hasHeader?: boolean;
}): Promise<{ rowCount: number; columns: string[] }> {
  const { sessionId, agentId, tableName, csvContent, hasHeader = true } = params;
  const safe = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
  const { con } = getSession(sessionId);

  // Write CSV to DuckDB temp table via read_csv_auto
  // We pass the CSV as a string via a VALUES clause trick using read_csv
  const escaped = csvContent.replace(/'/g, "''");
  const headerStr = hasHeader ? 'true' : 'false';

  const sql = `CREATE OR REPLACE TABLE "${safe}" AS
    SELECT * FROM read_csv_auto(
      (SELECT * FROM (VALUES ('${escaped}')) AS t(data)),
      header = ${headerStr}
    )`;

  await runExec(con, sql);

  const info = await runQuery(con, `SELECT COUNT(*) as cnt FROM "${safe}"`);
  const cols = await runQuery(con, `DESCRIBE "${safe}"`);
  const columns = cols.map((c) => String(c.column_name ?? c.Field ?? ''));
  const rowCount = Number((info[0] as Record<string, unknown>)?.cnt ?? 0);

  // Store table info in scratchpad
  scratchpadSet({
    sessionId,
    agentId,
    key: `duckdb:table:${safe}`,
    value: { tableName: safe, rowCount, columns, createdAt: new Date().toISOString() },
  });

  logger.debug({ sessionId, tableName: safe, rowCount }, '[duckdb] CSV loaded');
  return { rowCount, columns };
}

/**
 * Ingest a JSON array into a named table. Creates or replaces the table.
 */
export async function loadJson(params: {
  sessionId: string;
  agentId: string;
  tableName: string;
  records: Record<string, unknown>[];
}): Promise<{ rowCount: number; columns: string[] }> {
  const { sessionId, agentId, tableName, records } = params;
  const safe = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
  const { con } = getSession(sessionId);

  if (records.length === 0) {
    return { rowCount: 0, columns: [] };
  }

  // Build CREATE TABLE + INSERT from JSON records
  const columns = Object.keys(records[0]);
  const colDefs = columns.map((c) => `"${c}" VARCHAR`).join(', ');
  await runExec(con, `CREATE OR REPLACE TABLE "${safe}" (${colDefs})`);

  // Insert in batches of 100
  const BATCH = 100;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const valueSets = batch.map((row) => {
      const vals = columns.map((c) => {
        const v = row[c];
        if (v == null) return 'NULL';
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      return `(${vals.join(', ')})`;
    });
    await runExec(con, `INSERT INTO "${safe}" VALUES ${valueSets.join(', ')}`);
  }

  // Store table info in scratchpad
  scratchpadSet({
    sessionId,
    agentId,
    key: `duckdb:table:${safe}`,
    value: { tableName: safe, rowCount: records.length, columns, createdAt: new Date().toISOString() },
  });

  logger.debug({ sessionId, tableName: safe, rowCount: records.length }, '[duckdb] JSON loaded');
  return { rowCount: records.length, columns };
}

/**
 * List all tables in the session's DuckDB instance.
 */
export async function listTables(params: { sessionId: string }): Promise<string[]> {
  const { con } = getSession(params.sessionId);
  const rows = await runQuery(con, `SHOW TABLES`);
  return rows.map((r) => String(r.name ?? ''));
}

/**
 * Drop a table from the session's DuckDB instance.
 */
export async function dropTable(params: { sessionId: string; tableName: string }): Promise<void> {
  const safe = params.tableName.replace(/[^a-zA-Z0-9_]/g, '_');
  const { con } = getSession(params.sessionId);
  await runExec(con, `DROP TABLE IF EXISTS "${safe}"`);
}

/**
 * Stats for health endpoints.
 */
export function duckdbStats(): { sessions: number } {
  return { sessions: sessions.size };
}
