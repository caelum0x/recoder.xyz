"use strict";
/**
 * @module duckdb.routes
 *
 * HTTP routes for in-process DuckDB data operations.
 * Mounted at /api/a2a/data
 *
 * POST /query        run SQL against the session's DuckDB
 * POST /load/csv     ingest CSV into a named table
 * POST /load/json    ingest JSON array into a named table
 * GET  /tables       list tables in the session
 * DELETE /tables/:name  drop a table
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.duckdbRouter = void 0;
const express_1 = require("express");
const duckdb_tool_js_1 = require("./duckdb-tool.js");
const logger_js_1 = require("../logger.js");
const router = (0, express_1.Router)();
exports.duckdbRouter = router;
function ok(res, data) {
    res.json({ success: true, data });
}
function fail(res, status, message) {
    res.status(status).json({ success: false, error: message });
}
function resolveSession(req) {
    return req.sessionId ?? req.headers['x-session-id'] ?? req.userId ?? 'anonymous';
}
// POST /api/a2a/data/query
router.post('/query', async (req, res) => {
    const { sql, scratchpad_key } = req.body;
    if (!sql || typeof sql !== 'string' || !sql.trim()) {
        return fail(res, 400, 'sql is required');
    }
    const sessionId = resolveSession(req);
    const agentId = req.body.agent_id ?? 'unknown';
    try {
        const result = await (0, duckdb_tool_js_1.queryData)({ sessionId, agentId, sql: sql.trim(), scratchpadKey: scratchpad_key });
        ok(res, result);
    }
    catch (err) {
        logger_js_1.logger.warn({ err, sessionId }, '[duckdb.routes] query failed');
        fail(res, 400, err instanceof Error ? err.message : 'Query failed');
    }
});
// POST /api/a2a/data/load/csv
router.post('/load/csv', async (req, res) => {
    const { table_name, csv_content, has_header = true } = req.body;
    if (!table_name || !csv_content) {
        return fail(res, 400, 'table_name and csv_content are required');
    }
    const sessionId = resolveSession(req);
    const agentId = req.body.agent_id ?? 'unknown';
    try {
        const result = await (0, duckdb_tool_js_1.loadCsv)({ sessionId, agentId, tableName: table_name, csvContent: csv_content, hasHeader: has_header });
        ok(res, result);
    }
    catch (err) {
        logger_js_1.logger.warn({ err, sessionId }, '[duckdb.routes] loadCsv failed');
        fail(res, 400, err instanceof Error ? err.message : 'CSV load failed');
    }
});
// POST /api/a2a/data/load/json
router.post('/load/json', async (req, res) => {
    const { table_name, records } = req.body;
    if (!table_name || !Array.isArray(records)) {
        return fail(res, 400, 'table_name and records[] are required');
    }
    const sessionId = resolveSession(req);
    const agentId = req.body.agent_id ?? 'unknown';
    try {
        const result = await (0, duckdb_tool_js_1.loadJson)({ sessionId, agentId, tableName: table_name, records });
        ok(res, result);
    }
    catch (err) {
        logger_js_1.logger.warn({ err, sessionId }, '[duckdb.routes] loadJson failed');
        fail(res, 400, err instanceof Error ? err.message : 'JSON load failed');
    }
});
// GET /api/a2a/data/tables
router.get('/tables', async (req, res) => {
    const sessionId = resolveSession(req);
    try {
        const tables = await (0, duckdb_tool_js_1.listTables)({ sessionId });
        ok(res, { tables });
    }
    catch (err) {
        logger_js_1.logger.warn({ err, sessionId }, '[duckdb.routes] listTables failed');
        fail(res, 500, err instanceof Error ? err.message : 'List tables failed');
    }
});
// DELETE /api/a2a/data/tables/:name
router.delete('/tables/:name', async (req, res) => {
    const sessionId = resolveSession(req);
    const { name } = req.params;
    try {
        await (0, duckdb_tool_js_1.dropTable)({ sessionId, tableName: name });
        ok(res, { dropped: name });
    }
    catch (err) {
        logger_js_1.logger.warn({ err, sessionId }, '[duckdb.routes] dropTable failed');
        fail(res, 500, err instanceof Error ? err.message : 'Drop table failed');
    }
});
