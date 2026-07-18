/**
 * SECURITY: the persistence MCP tools reach the multi-tenant CONTROL-PLANE DB.
 * They must bind to the host-authorized {@link McpToolCaller} (refuse when none)
 * and `db_query_readonly` must NOT expose a raw SELECT over the whole DB — a
 * query against a non-allowlisted table (`user`, `secrets`, …) must be REJECTED
 * before it reaches the executor. These tests pin those guards.
 */
import { describe, it, expect } from 'vitest';
import { buildPersistenceMcpTools } from '../mcp/persistence-engine.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { PersistenceModule } from '../index.js';

/** A fake module that records every SELECT / introspection that reaches the DB seam. */
function fakeModule(): {
  module: PersistenceModule;
  executed: { sql: string }[];
  inspected: string[];
} {
  const executed: { sql: string }[] = [];
  const inspected: string[] = [];
  const executor = {
    isAvailable: () => true,
    async execute(sql: string) {
      executed.push({ sql });
      return [] as const;
    },
  };
  const schema = {
    async inspectTables() {
      inspected.push('tables');
      return [{ schema: 'core', name: 'x', columns: 1 }] as const;
    },
    async inspectColumns() {
      inspected.push('columns');
      return [] as const;
    },
    async inspectIndexes() {
      inspected.push('indexes');
      return [] as const;
    },
  };
  const module = {
    executor: () => executor,
    schema: () => schema,
  } as unknown as PersistenceModule;
  return { module, executed, inspected };
}

function tool(tools: readonly McpToolRegistration[], name: string): McpToolRegistration {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

const caller = (over: Partial<McpToolCaller> = {}): McpToolCaller => ({ userId: 'u1', ...over });

describe('persistence MCP tools — caller binding + tenant-safe reads', () => {
  it('db_query_readonly refuses when there is no authorized caller (never guesses)', async () => {
    const { module, executed } = fakeModule();
    const q = tool(buildPersistenceMcpTools(module), 'db_query_readonly');
    await expect(
      q.handler({ sql: 'select 1 from core.foo' }, undefined),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    // The victim query never reached the data seam.
    expect(executed).toHaveLength(0);
  });

  it('db_query_readonly denies a raw read of another tenant table and never hits the DB', async () => {
    const { module, executed } = fakeModule();
    const q = tool(buildPersistenceMcpTools(module), 'db_query_readonly');
    // ATTACK: an authorized agent tries to read every tenant's rows.
    await expect(
      q.handler({ sql: 'select * from "user"' }, caller()),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    await expect(
      q.handler({ sql: 'select * from secrets' }, caller()),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    // Neither non-allowlisted table reached the executor.
    expect(executed).toHaveLength(0);
  });

  it('db_query_readonly rejects comment/separator evasion before the DB seam', async () => {
    const { module, executed } = fakeModule();
    const q = tool(buildPersistenceMcpTools(module), 'db_query_readonly');
    await expect(
      q.handler({ sql: 'select * from allowed_view -- ; drop' }, caller()),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      q.handler({ sql: 'select 1; select * from secrets' }, caller()),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(executed).toHaveLength(0);
  });

  it('db_query_readonly denies a subquery-scoped read of a non-allowlisted table', async () => {
    const { module, executed } = fakeModule();
    const q = tool(buildPersistenceMcpTools(module), 'db_query_readonly');
    await expect(
      q.handler({ sql: 'select (select token from secrets limit 1)' }, caller()),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(executed).toHaveLength(0);
  });

  it('db_query_readonly still enforces SELECT-only and required sql (unchanged)', async () => {
    const { module, executed } = fakeModule();
    const q = tool(buildPersistenceMcpTools(module), 'db_query_readonly');
    await expect(q.handler({ sql: '' }, caller())).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(
      q.handler({ sql: 'update core.foo set x = 1' }, caller()),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(executed).toHaveLength(0);
  });

  it('db_schema_inspect refuses when there is no authorized caller', async () => {
    const { module, inspected } = fakeModule();
    const s = tool(buildPersistenceMcpTools(module), 'db_schema_inspect');
    await expect(s.handler({}, undefined)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    // Introspection never ran for an unauthenticated caller.
    expect(inspected).toHaveLength(0);
  });

  it('db_schema_inspect serves an authorized caller', async () => {
    const { module, inspected } = fakeModule();
    const s = tool(buildPersistenceMcpTools(module), 'db_schema_inspect');
    const out = (await s.handler({}, caller())) as { tables: unknown[] };
    expect(out.tables).toHaveLength(1);
    expect(inspected).toEqual(['tables']);
  });
});
