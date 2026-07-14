/**
 * beads-sql — direct-SQL READ fast-path against the beads dolt sql-server.
 *
 * bd runs a dolt sql-server (MySQL wire protocol) next to the issue graph; its
 * port is published in `<repoRoot>/.beads/dolt-server.port`. When that server is
 * up we can answer read-only queries (ready issues, memory recall) in one round
 * trip instead of shelling out to the `bd` CLI. The bd CLI remains the ONLY
 * write path — every query in this module is SELECT-only.
 *
 * The ready query uses the database's own `ready_issues` VIEW (bd's canonical,
 * server-side definition of "ready": open status, non-ephemeral, no transitive
 * open blockers, defer_until honored), so it stays correct even when the local
 * bd CLI version drifts from the db schema.
 *
 * DEGRADE-SAFE by construction — every entry point returns `undefined` (never
 * throws, never fabricates rows) when:
 *   - the port file is missing/unparsable (server not running), or
 *   - mysql2 is not installed (lazy optional import), or
 *   - the connection/query fails for any reason.
 * Callers treat `undefined` as "fast-path unavailable" and fall back to the CLI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BeadsIssue } from '@recoder/beads-adapter';
import type { MemoryEntry } from './beads-memory.js';
import { createLogger } from '../logger.js';

const logger = createLogger('conductor:beads-sql');

/** Connection parameters for the local dolt sql-server (MySQL wire). */
export type DoltConnectionConfig = {
  host: string;
  port: number;
  user: string;
  database: string;
  connectTimeout: number;
  /** DATETIME columns come back as strings, matching BeadsIssue's string dates. */
  dateStrings: true;
};

/** Test seam: override the port-file read and/or the mysql2 module load. */
export type BeadsSqlTestOverrides = {
  readPortFile?: () => string | undefined;
  loadMysql?: () => Promise<unknown>;
};

let testOverrides: BeadsSqlTestOverrides | undefined;

/** Test seam: inject fakes. Pass undefined to restore real behavior. */
export function __setBeadsSqlOverridesForTest(overrides: BeadsSqlTestOverrides | undefined): void {
  testOverrides = overrides;
}

/** Same repo-root convention as beads-memory's run(). */
function repoRoot(): string {
  return process.env.CONDUCTOR_REPO_ROOT || process.cwd();
}

function readPortFile(): string | undefined {
  if (testOverrides?.readPortFile) return testOverrides.readPortFile();
  try {
    return readFileSync(join(repoRoot(), '.beads', 'dolt-server.port'), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Resolve connection params for the running dolt sql-server, or `undefined`
 * when it is not running. The port file is read FRESH on every call — the
 * server picks a new ephemeral port on each restart.
 *
 * Host/user/database are dolt-server defaults for this repo's `.beads` layout
 * (db name = `.beads/dolt/<name>` directory; no password configured).
 */
export function resolveDoltConnection(): DoltConnectionConfig | undefined {
  const raw = readPortFile();
  if (!raw) return undefined;
  const port = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return undefined;
  return {
    host: '127.0.0.1',
    port,
    user: 'root',
    database: process.env.CONDUCTOR_BEADS_DB?.trim() || 'recoder',
    connectTimeout: 1_500,
    dateStrings: true,
  };
}

/** Minimal structural slice of mysql2/promise that this module uses. */
type MysqlConnection = {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
  end(): Promise<void>;
};
type MysqlModule = {
  createConnection(config: DoltConnectionConfig): Promise<MysqlConnection>;
};

let cachedMysql: MysqlModule | undefined;
let mysqlLoadFailed = false;

function asMysqlModule(mod: unknown): MysqlModule | undefined {
  if (typeof mod !== 'object' || mod == null) return undefined;
  const candidate = (mod as { default?: unknown }).default ?? mod;
  if (
    typeof candidate === 'object' &&
    candidate != null &&
    typeof (candidate as { createConnection?: unknown }).createConnection === 'function'
  ) {
    return candidate as MysqlModule;
  }
  return undefined;
}

/**
 * LAZY optional import of mysql2/promise, cached after first resolution. The
 * non-literal specifier keeps tsc/bundlers from hard-requiring the module on
 * checkouts where it is absent — absence just disables the fast-path.
 */
async function loadMysql(): Promise<MysqlModule | undefined> {
  if (testOverrides?.loadMysql) {
    try {
      return asMysqlModule(await testOverrides.loadMysql());
    } catch {
      return undefined;
    }
  }
  if (cachedMysql) return cachedMysql;
  if (mysqlLoadFailed) return undefined;
  try {
    const mod: unknown = await import(String('mysql2/promise'));
    const resolved = asMysqlModule(mod);
    if (!resolved) throw new Error('mysql2/promise did not expose createConnection');
    cachedMysql = resolved;
    return resolved;
  } catch (err) {
    mysqlLoadFailed = true;
    logger.info(
      { reason: String(err).slice(0, 200) },
      'mysql2 unavailable — beads SQL fast-path disabled, callers fall back to bd CLI',
    );
    return undefined;
  }
}

/**
 * Short-lived connection per call: create → query → end. Returns row objects,
 * or `undefined` on ANY failure (connect, query) — degrade, never throw.
 */
async function runSelect(sql: string, values: unknown[]): Promise<Array<Record<string, unknown>> | undefined> {
  const config = resolveDoltConnection();
  if (!config) return undefined;
  const mysql = await loadMysql();
  if (!mysql) return undefined;
  let conn: MysqlConnection | undefined;
  try {
    conn = await mysql.createConnection(config);
    const [rows] = await conn.query(sql, values);
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  } catch (err) {
    logger.warn({ reason: String(err).slice(0, 200) }, 'beads SQL fast-path query failed — degrading to CLI path');
    return undefined;
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch {
        // Connection teardown failures are irrelevant to the caller.
      }
    }
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function splitLabels(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  return value
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
}

function rowToBeadsIssue(row: Record<string, unknown>): BeadsIssue | undefined {
  const id = optionalString(row.id);
  if (!id) return undefined;
  const labels = splitLabels(row.labels);
  return {
    id,
    title: typeof row.title === 'string' ? row.title : '',
    description: optionalString(row.description),
    status: optionalString(row.status),
    priority: typeof row.priority === 'number' ? row.priority : undefined,
    issue_type: optionalString(row.issue_type),
    assignee: optionalString(row.assignee),
    owner: optionalString(row.owner),
    labels: labels.length > 0 ? labels : undefined,
    created_at: optionalString(row.created_at),
    updated_at: optionalString(row.updated_at),
    closed_at: optionalString(row.closed_at),
  };
}

/** Ready issues via the db's own view; ordering matches `bd ready` (priority asc, created asc). */
const READY_SQL = `
  SELECT r.id, r.title, r.description, r.status, r.priority, r.issue_type,
         r.assignee, r.owner, r.created_at, r.updated_at, r.closed_at,
         (SELECT GROUP_CONCAT(l.label SEPARATOR ',') FROM labels l WHERE l.issue_id = r.id) AS labels
  FROM ready_issues r
  ORDER BY r.priority ASC, r.created_at ASC`;

/**
 * Ready issues straight from the dolt sql-server's `ready_issues` view.
 * Returns `undefined` when the fast-path is unavailable (caller falls back to
 * the bd CLI); returns `[]` truthfully when the server is up and nothing is ready.
 */
export async function queryReadyIssues(options: { limit?: number } = {}): Promise<BeadsIssue[] | undefined> {
  const limit = options.limit;
  const sql = typeof limit === 'number' && limit > 0 ? `${READY_SQL}\n  LIMIT ?` : READY_SQL;
  const values = typeof limit === 'number' && limit > 0 ? [Math.floor(limit)] : [];
  const rows = await runSelect(sql, values);
  if (rows === undefined) return undefined;
  return rows.map(rowToBeadsIssue).filter((issue): issue is BeadsIssue => issue !== undefined);
}

/**
 * Memory recall branch over one of the two stores bd uses:
 * promoted memories live in `issues`/`labels`, ephemeral candidates (wisps) in
 * `wisps`/`wisp_labels`. Both require the `memory` label and match the query
 * against title OR description — mirroring `bd search <q> --label memory --status all`.
 */
function memoryBranch(table: string, labelTable: string, scoped: boolean): string {
  const scopeClause = scoped
    ? `AND EXISTS (SELECT 1 FROM ${labelTable} ls WHERE ls.issue_id = t.id AND ls.label = ?)`
    : '';
  return `
    SELECT t.id, t.title, t.description, t.status, t.created_at,
           (SELECT GROUP_CONCAT(l2.label SEPARATOR ',') FROM ${labelTable} l2 WHERE l2.issue_id = t.id) AS labels
    FROM ${table} t
    WHERE EXISTS (SELECT 1 FROM ${labelTable} l WHERE l.issue_id = t.id AND l.label = 'memory')
      ${scopeClause}
      AND (t.title LIKE CONCAT('%', ?, '%') OR t.description LIKE CONCAT('%', ?, '%'))`;
}

function rowToMemoryEntry(row: Record<string, unknown>): MemoryEntry | undefined {
  const id = optionalString(row.id);
  if (!id) return undefined;
  return {
    id,
    title: typeof row.title === 'string' ? row.title : '',
    description: typeof row.description === 'string' ? row.description : '',
    status: typeof row.status === 'string' ? row.status : '',
    labels: splitLabels(row.labels),
  };
}

/**
 * Memory recall (candidates + promoted) via SQL — UNION over `issues` (promoted)
 * and `wisps` (ephemeral candidates), newest first. Returns `undefined` when the
 * fast-path is unavailable so callers can fall back to `bd search`; returns `[]`
 * for an empty/blank query (parity with recallMemories) or a genuine no-match.
 */
export async function queryMemories(
  query: string,
  options: { scope?: string; limit?: number } = {},
): Promise<MemoryEntry[] | undefined> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 50);
  const scope = options.scope?.trim();
  const scoped = Boolean(scope);
  const scopeLabel = scoped ? `memory-scope:${scope}` : undefined;

  const sql = `
    SELECT id, title, description, status, labels FROM (
      ${memoryBranch('issues', 'labels', scoped)}
      UNION ALL
      ${memoryBranch('wisps', 'wisp_labels', scoped)}
    ) m
    ORDER BY m.created_at DESC
    LIMIT ?`;

  const branchValues = scoped ? [scopeLabel, q, q] : [q, q];
  const values = [...branchValues, ...branchValues, limit];

  const rows = await runSelect(sql, values);
  if (rows === undefined) return undefined;
  return rows.map(rowToMemoryEntry).filter((entry): entry is MemoryEntry => entry !== undefined);
}
