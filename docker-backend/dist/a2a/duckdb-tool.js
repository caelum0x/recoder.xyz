"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryData = queryData;
exports.loadCsv = loadCsv;
exports.loadJson = loadJson;
exports.listTables = listTables;
exports.dropTable = dropTable;
exports.duckdbStats = duckdbStats;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const duckdb_1 = __importDefault(require("duckdb"));
const logger_js_1 = require("../logger.js");
const scratchpad_js_1 = require("./scratchpad.js");
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_RESULT_ROWS = 500;
const sessions = new Map();
// ── TTL eviction ──────────────────────────────────────────────────────────────
function evictStale() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [sessionId, s] of sessions) {
        if (s.lastAccess < cutoff) {
            try {
                s.con.close();
            }
            catch { /* ignore */ }
            try {
                s.db.close();
            }
            catch { /* ignore */ }
            sessions.delete(sessionId);
            logger_js_1.logger.debug({ sessionId }, '[duckdb] Evicted stale session');
        }
    }
}
setInterval(evictStale, 10 * 60 * 1000).unref();
// ── Session management ────────────────────────────────────────────────────────
function getSession(sessionId) {
    let s = sessions.get(sessionId);
    if (!s) {
        const db = new duckdb_1.default.Database(':memory:');
        const con = db.connect();
        s = { db, con, lastAccess: Date.now() };
        sessions.set(sessionId, s);
        logger_js_1.logger.debug({ sessionId }, '[duckdb] Created session database');
    }
    s.lastAccess = Date.now();
    return s;
}
// ── Query helper ──────────────────────────────────────────────────────────────
function runQuery(con, sql) {
    return new Promise((resolve, reject) => {
        con.all(sql, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve((rows ?? []));
        });
    });
}
function runExec(con, sql) {
    return new Promise((resolve, reject) => {
        con.exec(sql, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
/**
 * Execute SQL against the session's DuckDB instance.
 * Results are written to scratchpad under `duckdb:{queryHash}`.
 */
async function queryData(params) {
    const { sessionId, agentId, sql, scratchpadKey } = params;
    const { con } = getSession(sessionId);
    const rows = await runQuery(con, sql);
    const truncated = rows.length > MAX_RESULT_ROWS;
    const sliced = truncated ? rows.slice(0, MAX_RESULT_ROWS) : rows;
    const columns = sliced.length > 0 ? Object.keys(sliced[0]) : [];
    const result = {
        rows: sliced,
        rowCount: rows.length,
        columns,
        truncated,
    };
    // Write to scratchpad if key provided
    if (scratchpadKey) {
        (0, scratchpad_js_1.scratchpadSet)({ sessionId, agentId, key: scratchpadKey, value: result });
    }
    logger_js_1.logger.debug({ sessionId, rowCount: result.rowCount, truncated }, '[duckdb] Query executed');
    return result;
}
/**
 * Ingest CSV content into a named table. Creates or replaces the table.
 * Content can be raw CSV string or a URL to fetch.
 */
async function loadCsv(params) {
    const { sessionId, agentId, tableName, csvContent, hasHeader = true } = params;
    const safe = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    const { con } = getSession(sessionId);
    // Write CSV to temp file — DuckDB's read_csv_auto reads from the filesystem
    const tmpFile = node_path_1.default.join(node_os_1.default.tmpdir(), `duckdb_csv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.csv`);
    node_fs_1.default.writeFileSync(tmpFile, csvContent, 'utf-8');
    try {
        const headerStr = hasHeader ? 'true' : 'false';
        const escapedPath = tmpFile.replace(/'/g, "''");
        await runExec(con, `CREATE OR REPLACE TABLE "${safe}" AS SELECT * FROM read_csv_auto('${escapedPath}', header = ${headerStr})`);
    }
    finally {
        try {
            node_fs_1.default.unlinkSync(tmpFile);
        }
        catch { /* ok */ }
    }
    const info = await runQuery(con, `SELECT COUNT(*) as cnt FROM "${safe}"`);
    const cols = await runQuery(con, `DESCRIBE "${safe}"`);
    const columns = cols.map((c) => String(c.column_name ?? c.Field ?? ''));
    const rowCount = Number(info[0]?.cnt ?? 0);
    // Store table info in scratchpad
    (0, scratchpad_js_1.scratchpadSet)({
        sessionId,
        agentId,
        key: `duckdb:table:${safe}`,
        value: { tableName: safe, rowCount, columns, createdAt: new Date().toISOString() },
    });
    logger_js_1.logger.debug({ sessionId, tableName: safe, rowCount }, '[duckdb] CSV loaded');
    return { rowCount, columns };
}
/**
 * Ingest a JSON array into a named table. Creates or replaces the table.
 */
async function loadJson(params) {
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
                if (v == null)
                    return 'NULL';
                return `'${String(v).replace(/'/g, "''")}'`;
            });
            return `(${vals.join(', ')})`;
        });
        await runExec(con, `INSERT INTO "${safe}" VALUES ${valueSets.join(', ')}`);
    }
    // Store table info in scratchpad
    (0, scratchpad_js_1.scratchpadSet)({
        sessionId,
        agentId,
        key: `duckdb:table:${safe}`,
        value: { tableName: safe, rowCount: records.length, columns, createdAt: new Date().toISOString() },
    });
    logger_js_1.logger.debug({ sessionId, tableName: safe, rowCount: records.length }, '[duckdb] JSON loaded');
    return { rowCount: records.length, columns };
}
/**
 * List all tables in the session's DuckDB instance.
 */
async function listTables(params) {
    const { con } = getSession(params.sessionId);
    const rows = await runQuery(con, `SHOW TABLES`);
    return rows.map((r) => String(r.name ?? ''));
}
/**
 * Drop a table from the session's DuckDB instance.
 */
async function dropTable(params) {
    const safe = params.tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    const { con } = getSession(params.sessionId);
    await runExec(con, `DROP TABLE IF EXISTS "${safe}"`);
}
/**
 * Stats for health endpoints.
 */
function duckdbStats() {
    return { sessions: sessions.size };
}
