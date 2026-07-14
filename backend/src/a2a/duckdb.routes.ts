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

import { Router } from 'express';
import type { Request, Response } from 'express';
import { queryData, loadCsv, loadJson, listTables, dropTable } from './duckdb-tool.js';
import { logger } from '../logger.js';

interface AuthedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

const router = Router();

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

function resolveSession(req: AuthedRequest): string {
  return req.sessionId ?? req.headers['x-session-id'] as string ?? req.userId ?? 'anonymous';
}

// POST /api/a2a/data/query
router.post('/query', async (req: AuthedRequest, res: Response) => {
  const { sql, scratchpad_key } = req.body as { sql?: string; scratchpad_key?: string };

  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    return fail(res, 400, 'sql is required');
  }

  const sessionId = resolveSession(req);
  const agentId = (req.body as Record<string, unknown>).agent_id as string ?? 'unknown';

  try {
    const result = await queryData({ sessionId, agentId, sql: sql.trim(), scratchpadKey: scratchpad_key });
    ok(res, result);
  } catch (err) {
    logger.warn({ err, sessionId }, '[duckdb.routes] query failed');
    fail(res, 400, err instanceof Error ? err.message : 'Query failed');
  }
});

// POST /api/a2a/data/load/csv
router.post('/load/csv', async (req: AuthedRequest, res: Response) => {
  const { table_name, csv_content, has_header = true } = req.body as {
    table_name?: string;
    csv_content?: string;
    has_header?: boolean;
  };

  if (!table_name || !csv_content) {
    return fail(res, 400, 'table_name and csv_content are required');
  }

  const sessionId = resolveSession(req);
  const agentId = (req.body as Record<string, unknown>).agent_id as string ?? 'unknown';

  try {
    const result = await loadCsv({ sessionId, agentId, tableName: table_name, csvContent: csv_content, hasHeader: has_header });
    ok(res, result);
  } catch (err) {
    logger.warn({ err, sessionId }, '[duckdb.routes] loadCsv failed');
    fail(res, 400, err instanceof Error ? err.message : 'CSV load failed');
  }
});

// POST /api/a2a/data/load/json
router.post('/load/json', async (req: AuthedRequest, res: Response) => {
  const { table_name, records } = req.body as {
    table_name?: string;
    records?: Record<string, unknown>[];
  };

  if (!table_name || !Array.isArray(records)) {
    return fail(res, 400, 'table_name and records[] are required');
  }

  const sessionId = resolveSession(req);
  const agentId = (req.body as Record<string, unknown>).agent_id as string ?? 'unknown';

  try {
    const result = await loadJson({ sessionId, agentId, tableName: table_name, records });
    ok(res, result);
  } catch (err) {
    logger.warn({ err, sessionId }, '[duckdb.routes] loadJson failed');
    fail(res, 400, err instanceof Error ? err.message : 'JSON load failed');
  }
});

// GET /api/a2a/data/tables
router.get('/tables', async (req: AuthedRequest, res: Response) => {
  const sessionId = resolveSession(req);
  try {
    const tables = await listTables({ sessionId });
    ok(res, { tables });
  } catch (err) {
    logger.warn({ err, sessionId }, '[duckdb.routes] listTables failed');
    fail(res, 500, err instanceof Error ? err.message : 'List tables failed');
  }
});

// DELETE /api/a2a/data/tables/:name
router.delete('/tables/:name', async (req: AuthedRequest, res: Response) => {
  const sessionId = resolveSession(req);
  const { name } = req.params;
  try {
    await dropTable({ sessionId, tableName: name });
    ok(res, { dropped: name });
  } catch (err) {
    logger.warn({ err, sessionId }, '[duckdb.routes] dropTable failed');
    fail(res, 500, err instanceof Error ? err.message : 'Drop table failed');
  }
});

export { router as duckdbRouter };
