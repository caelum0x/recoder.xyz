import { describe, it, expect, afterEach, vi } from 'vitest';
import type { BeadsClient, BeadsIssue } from '@recoder/beads-adapter';
import {
  resolveDoltConnection,
  queryReadyIssues,
  queryMemories,
  __setBeadsSqlOverridesForTest,
} from './beads-sql.js';
import { listReadyBeadsTasks } from './beads-sync.js';

/**
 * Proves the direct-SQL read fast-path against the beads dolt sql-server is
 * degrade-safe (undefined — never a throw, never fabricated rows — when the
 * port file or mysql2 is missing or the query fails) and that
 * listReadyBeadsTasks uses the SQL path when available and falls back to the
 * bd CLI path (injected client) when it is not. Both seams (port-file read and
 * mysql2 module load) are mocked, so no dolt server or mysql2 install is needed.
 */

type QueryCall = { sql: string; values?: unknown[] };

function fakeMysql(
  rows: Array<Record<string, unknown>>,
  opts: { failQuery?: boolean; failConnect?: boolean } = {},
): { mod: unknown; state: { ended: number; queries: QueryCall[] } } {
  const state = { ended: 0, queries: [] as QueryCall[] };
  const mod = {
    async createConnection() {
      if (opts.failConnect) throw new Error('connect refused');
      return {
        async query(sql: string, values?: unknown[]) {
          state.queries.push({ sql, values });
          if (opts.failQuery) throw new Error('query boom');
          return [rows, []] as [unknown, unknown];
        },
        async end() {
          state.ended += 1;
        },
      };
    },
  };
  return { mod, state };
}

function overrides(portFile: string | undefined, mysqlMod: unknown | undefined) {
  __setBeadsSqlOverridesForTest({
    readPortFile: () => portFile,
    loadMysql: async () => mysqlMod,
  });
}

afterEach(() => {
  __setBeadsSqlOverridesForTest(undefined);
});

describe('resolveDoltConnection', () => {
  it('returns connection config when the port file holds a valid port', () => {
    __setBeadsSqlOverridesForTest({ readPortFile: () => '54228\n' });
    expect(resolveDoltConnection()).toEqual({
      host: '127.0.0.1',
      port: 54228,
      user: 'root',
      database: 'recoder',
      connectTimeout: 1500,
      dateStrings: true,
    });
  });

  it.each([
    ['missing port file', undefined],
    ['non-numeric content', 'not-a-port'],
    ['negative port', '-5'],
    ['zero port', '0'],
    ['out-of-range port', '70000'],
  ])('returns undefined for %s (server not running)', (_label, content) => {
    __setBeadsSqlOverridesForTest({ readPortFile: () => content });
    expect(resolveDoltConnection()).toBeUndefined();
  });
});

describe('queryReadyIssues', () => {
  const readyRow = {
    id: 'recoder-9bqf',
    title: 'Fix the widget',
    description: 'intent: bug',
    status: 'open',
    priority: 0,
    issue_type: 'bug',
    assignee: null,
    owner: null,
    created_at: '2026-07-12 15:13:04',
    updated_at: '2026-07-12 15:13:04',
    closed_at: null,
    labels: 'alpha,beta',
  };

  it('maps rows from the ready_issues view to BeadsIssue (nulls → undefined, labels split)', async () => {
    const { mod, state } = fakeMysql([readyRow]);
    overrides('54228', mod);

    const issues = await queryReadyIssues();

    expect(issues).toEqual([
      {
        id: 'recoder-9bqf',
        title: 'Fix the widget',
        description: 'intent: bug',
        status: 'open',
        priority: 0,
        issue_type: 'bug',
        assignee: undefined,
        owner: undefined,
        labels: ['alpha', 'beta'],
        created_at: '2026-07-12 15:13:04',
        updated_at: '2026-07-12 15:13:04',
        closed_at: undefined,
      } satisfies BeadsIssue,
    ]);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0]?.sql).toContain('FROM ready_issues');
    expect(state.queries[0]?.sql).toContain('ORDER BY r.priority ASC, r.created_at ASC');
    // Short-lived connection: always closed.
    expect(state.ended).toBe(1);
  });

  it('applies LIMIT as a bound parameter when requested', async () => {
    const { mod, state } = fakeMysql([]);
    overrides('54228', mod);

    const issues = await queryReadyIssues({ limit: 3 });

    expect(issues).toEqual([]);
    expect(state.queries[0]?.sql).toContain('LIMIT ?');
    expect(state.queries[0]?.values).toEqual([3]);
  });

  it('returns undefined without loading mysql2 when the port file is absent', async () => {
    const loadMysql = vi.fn(async () => fakeMysql([]).mod);
    __setBeadsSqlOverridesForTest({ readPortFile: () => undefined, loadMysql });

    expect(await queryReadyIssues()).toBeUndefined();
    expect(loadMysql).not.toHaveBeenCalled();
  });

  it('returns undefined when mysql2 is not installed', async () => {
    overrides('54228', undefined);
    expect(await queryReadyIssues()).toBeUndefined();
  });

  it('returns undefined when the connection cannot be established', async () => {
    const { mod } = fakeMysql([], { failConnect: true });
    overrides('54228', mod);
    expect(await queryReadyIssues()).toBeUndefined();
  });

  it('returns undefined when the query fails, and still closes the connection', async () => {
    const { mod, state } = fakeMysql([], { failQuery: true });
    overrides('54228', mod);

    expect(await queryReadyIssues()).toBeUndefined();
    expect(state.ended).toBe(1);
  });

  it('drops malformed rows (missing id) instead of fabricating issues', async () => {
    const { mod } = fakeMysql([{ title: 'no id' }, readyRow]);
    overrides('54228', mod);

    const issues = await queryReadyIssues();
    expect(issues?.map((i) => i.id)).toEqual(['recoder-9bqf']);
  });
});

describe('queryMemories', () => {
  const memoryRow = {
    id: 'recoder-wisp-6v7',
    title: 'live-test: sqlx dotenv landmine',
    description: 'evidence body',
    status: 'open',
    labels: 'memory,memory-scope:repo',
  };

  it('maps rows to MemoryEntry and UNIONs issues (promoted) with wisps (candidates)', async () => {
    const { mod, state } = fakeMysql([memoryRow]);
    overrides('54228', mod);

    const memories = await queryMemories('dotenv');

    expect(memories).toEqual([
      {
        id: 'recoder-wisp-6v7',
        title: 'live-test: sqlx dotenv landmine',
        description: 'evidence body',
        status: 'open',
        labels: ['memory', 'memory-scope:repo'],
      },
    ]);
    const sql = state.queries[0]?.sql ?? '';
    expect(sql).toContain('FROM issues t');
    expect(sql).toContain('FROM wisps t');
    expect(sql).toContain('UNION ALL');
    // Default limit 5, query text bound twice per branch.
    expect(state.queries[0]?.values).toEqual(['dotenv', 'dotenv', 'dotenv', 'dotenv', 5]);
  });

  it('binds the scope label into both branches when a scope is given', async () => {
    const { mod, state } = fakeMysql([]);
    overrides('54228', mod);

    await queryMemories('dotenv', { scope: 'repo', limit: 2 });

    expect(state.queries[0]?.values).toEqual([
      'memory-scope:repo',
      'dotenv',
      'dotenv',
      'memory-scope:repo',
      'dotenv',
      'dotenv',
      2,
    ]);
  });

  it('returns [] for a blank query (parity with recallMemories) without querying', async () => {
    const { mod, state } = fakeMysql([memoryRow]);
    overrides('54228', mod);

    expect(await queryMemories('   ')).toEqual([]);
    expect(state.queries).toHaveLength(0);
  });

  it('returns undefined when the fast-path is unavailable', async () => {
    __setBeadsSqlOverridesForTest({ readPortFile: () => undefined });
    expect(await queryMemories('dotenv')).toBeUndefined();
  });
});

describe('listReadyBeadsTasks SQL fast-path wiring', () => {
  const sqlRow = {
    id: 'rx-900',
    title: 'From the dolt server',
    description: ['SQL-sourced ready issue.', 'intent: bug'].join('\n'),
    status: 'open',
    priority: 1,
    issue_type: 'bug',
    created_at: '2026-07-01 00:00:00',
    labels: null,
  };

  function fakeClient(): { client: BeadsClient; readyCalls: () => number } {
    const cliIssue: BeadsIssue = {
      id: 'rx-501',
      title: 'From the bd CLI',
      description: 'intent: bug',
      status: 'open',
      priority: 1,
      issue_type: 'bug',
    };
    let calls = 0;
    const client: BeadsClient = {
      ready() {
        calls += 1;
        return [cliIssue];
      },
      show() {
        return null;
      },
      create() {
        throw new Error('not used');
      },
      update() {
        throw new Error('not used');
      },
      close() {
        throw new Error('not used');
      },
    };
    return { client, readyCalls: () => calls };
  }

  it('serves ready tasks from the SQL fast-path when the dolt server is up (CLI untouched)', async () => {
    const { mod } = fakeMysql([sqlRow]);
    overrides('54228', mod);
    const { client, readyCalls } = fakeClient();

    const result = await listReadyBeadsTasks(
      { spaceId: 'space-conductor', repo: 'recoder/recoder.xyz' },
      { client },
    );

    expect(result.skipped).toBeUndefined();
    expect(result.ready.map((t) => t.taskId)).toEqual(['rx-900']);
    // Same beadsIssueToTaskSpec mapping as the CLI path.
    expect(result.ready[0]?.spaceId).toBe('space-conductor');
    expect(result.ready[0]?.repo).toBe('recoder/recoder.xyz');
    expect(result.ready[0]?.intent).toBe('bugfix');
    expect(result.ready[0]?.metadata?.source).toBe('beads');
    expect(readyCalls()).toBe(0);
  });

  it('returns a truthful empty list when the server is up and nothing is ready', async () => {
    const { mod } = fakeMysql([]);
    overrides('54228', mod);
    const { client, readyCalls } = fakeClient();

    const result = await listReadyBeadsTasks({ spaceId: 'space-conductor' }, { client });

    expect(result.ready).toEqual([]);
    expect(result.skipped).toBeUndefined();
    expect(readyCalls()).toBe(0);
  });

  it('falls back to the bd CLI path when the dolt server is not running', async () => {
    __setBeadsSqlOverridesForTest({ readPortFile: () => undefined });
    const { client, readyCalls } = fakeClient();

    const result = await listReadyBeadsTasks({ spaceId: 'space-conductor' }, { client });

    expect(result.ready.map((t) => t.taskId)).toEqual(['rx-501']);
    expect(readyCalls()).toBe(1);
  });

  it('falls back to the bd CLI path when the SQL query fails mid-flight', async () => {
    const { mod } = fakeMysql([], { failQuery: true });
    overrides('54228', mod);
    const { client, readyCalls } = fakeClient();

    const result = await listReadyBeadsTasks({ spaceId: 'space-conductor' }, { client });

    expect(result.ready.map((t) => t.taskId)).toEqual(['rx-501']);
    expect(readyCalls()).toBe(1);
  });
});
