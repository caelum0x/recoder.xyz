/**
 * Persistence MCP tools (skeleton per the wiring checklist). Registered into the
 * interop-gated MCP host by the engines domain (Phase 6); every call passes the
 * interop chain + governance gate at the host boundary.
 *
 *  - `db_schema_inspect`  — read-only schema introspection for agents.
 *  - `db_query_readonly`  — SELECT-only, `:param`-bound, result-size capped.
 *
 * Phase 1 provides truthful handlers over the module surface. The full MCP
 * registration (`IN_PROC_SERVERS` + `ENGINE_SERVERS`) is wired by engines.
 */
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { PersistenceModule } from './../index.js';

const MAX_ROWS = 500;

interface QueryReadonlyInput {
  readonly sql?: string;
  readonly params?: Record<string, unknown>;
}

interface SchemaInspectInput {
  readonly schema?: string;
  readonly table?: string;
}

export function buildPersistenceMcpTools(module: PersistenceModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'db_schema_inspect',
      description: 'Read-only introspection of control-plane tables/columns/indexes.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as SchemaInspectInput;
        if (!module.executor().isAvailable()) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'database is unavailable');
        }
        const inspector = module.schema();
        if (input.schema && input.table) {
          const [columns, indexes] = await Promise.all([
            inspector.inspectColumns(input.schema, input.table),
            inspector.inspectIndexes(input.schema, input.table),
          ]);
          return { schema: input.schema, table: input.table, columns, indexes };
        }
        return { tables: await inspector.inspectTables() };
      },
    },
    {
      name: 'db_query_readonly',
      description: 'Run a SELECT-only, :param-bound query (result-size capped).',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as QueryReadonlyInput;
        const sql = (input.sql ?? '').trim();
        if (!sql) throw new AppError(ErrorCode.INVALID_INPUT, 'sql is required');
        if (!/^select\b/i.test(sql)) {
          throw new AppError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'only SELECT queries are permitted');
        }
        if (!module.executor().isAvailable()) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'database is unavailable');
        }
        const rows = await module.executor().execute(sql, input.params ?? {});
        return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
      },
    },
  ];
}
