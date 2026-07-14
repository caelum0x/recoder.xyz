/**
 * `SchemaInspector` — read-only introspection of the CONTROL-PLANE database via
 * the shared `QueryExecutor`. Powers the `/internal/persistence/introspect`
 * edge and the `db_schema_inspect` MCP tool.
 *
 * (Distinct from the legacy `backend/src/database/schema-inspector.ts`, which
 * introspects encrypted EXTERNAL user-project connections — a separate
 * capability that stays with the connection-manager.)
 *
 * Every query targets `information_schema` / `pg_catalog` and is fully
 * parameterized; nothing here mutates.
 */
import type { QueryExecutor } from '../ports/query-executor.port.js';
import type { QueryRow } from '../types.js';

/** The application schemas we surface (never the pg_* system schemas). */
const APP_SCHEMAS = ['core', 'agent_os', 'pm', 'billing', 'kv'];

export interface TableInfo {
  readonly schema: string;
  readonly name: string;
  readonly columns: number;
}

export interface ColumnInfo {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
  readonly default: string | null;
}

export interface IndexInfo {
  readonly name: string;
  readonly definition: string;
}

export class SchemaInspector {
  constructor(private readonly executor: QueryExecutor) {}

  /** List application tables with their column counts. */
  async inspectTables(): Promise<readonly TableInfo[]> {
    const rows = await this.executor.read<QueryRow>(
      `select table_schema, table_name, count(*)::int as column_count
       from information_schema.columns
       where table_schema = any(:schemas)
       group by table_schema, table_name
       order by table_schema, table_name`,
      { schemas: APP_SCHEMAS },
    );
    return rows.map((r) => ({
      schema: String(r.table_schema),
      name: String(r.table_name),
      columns: Number(r.column_count ?? 0),
    }));
  }

  /** List the columns of a single table. */
  async inspectColumns(schema: string, table: string): Promise<readonly ColumnInfo[]> {
    const rows = await this.executor.read<QueryRow>(
      `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = :schema and table_name = :table
       order by ordinal_position`,
      { schema, table },
    );
    return rows.map((r) => ({
      name: String(r.column_name),
      dataType: String(r.data_type),
      nullable: r.is_nullable === 'YES',
      default: r.column_default === null || r.column_default === undefined ? null : String(r.column_default),
    }));
  }

  /** List the indexes on a single table. */
  async inspectIndexes(schema: string, table: string): Promise<readonly IndexInfo[]> {
    const rows = await this.executor.read<QueryRow>(
      `select indexname, indexdef
       from pg_indexes
       where schemaname = :schema and tablename = :table
       order by indexname`,
      { schema, table },
    );
    return rows.map((r) => ({ name: String(r.indexname), definition: String(r.indexdef) }));
  }
}

/** Build an inspector over the shared executor. */
export function createSchemaInspector(executor: QueryExecutor): SchemaInspector {
  return new SchemaInspector(executor);
}
