import { describe, expect, it, vi } from 'vitest';
import {
  RecoderGitService,
  parseAnalyzeStats,
  projectDomainMap,
  extractJson,
  type EngineExec,
  type ExecResult,
  type GitProvider,
  type IndexState,
  type IndexStateStore,
} from './recodergit-service';

function ok(stdout: string): ExecResult {
  return { stdout, stderr: '', code: 0 };
}

function fakeStore(): IndexStateStore & { states: Map<string, IndexState> } {
  const states = new Map<string, IndexState>();
  return {
    states,
    get: (repoId) => states.get(repoId) ?? null,
    set: (repoId, state) => {
      states.set(repoId, state);
    },
  };
}

function fakeGit(sha: string | null, branch: string | null = 'main'): GitProvider {
  return {
    headSha: async () => sha,
    currentBranch: async () => branch,
  };
}

const ANALYZE_OUT = 'Repository indexed successfully\n  1,234 nodes | 5,678 edges | 12 clusters | 3 flows\n';
const INPUT = { repoRoot: '/repo', repoId: 'r1' } as const;

describe('RecoderGitService — flag gating', () => {
  it('flag OFF -> every method is a no-op and NO exec/git is invoked', async () => {
    const exec = vi.fn<Parameters<EngineExec>, ReturnType<EngineExec>>(async () => {
      throw new Error('exec must not run when disabled');
    });
    const git: GitProvider = {
      headSha: vi.fn(async () => {
        throw new Error('git must not run when disabled');
      }),
      currentBranch: vi.fn(async () => null),
    };
    const service = new RecoderGitService({ isEnabled: () => false, exec, git });

    expect(service.isEnabled()).toBe(false);
    await expect(service.indexRepo(INPUT)).resolves.toEqual({ enabled: false });
    await expect(service.status('r1')).resolves.toEqual({ enabled: false });
    await expect(service.reindexOnPush({ repoId: 'r1' })).resolves.toEqual({ enabled: false });
    await expect(service.domainMap('r1')).resolves.toEqual({ enabled: false });
    expect(exec).not.toHaveBeenCalled();
    expect(git.headSha).not.toHaveBeenCalled();
  });

  it('default gate reads RECODER_CODE_GRAPH_ENABLED (default OFF)', () => {
    const prev = process.env.RECODER_CODE_GRAPH_ENABLED;
    try {
      delete process.env.RECODER_CODE_GRAPH_ENABLED;
      expect(new RecoderGitService().isEnabled()).toBe(false);
      process.env.RECODER_CODE_GRAPH_ENABLED = 'true';
      expect(new RecoderGitService().isEnabled()).toBe(true);
      process.env.RECODER_CODE_GRAPH_ENABLED = '0';
      expect(new RecoderGitService().isEnabled()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.RECODER_CODE_GRAPH_ENABLED;
      else process.env.RECODER_CODE_GRAPH_ENABLED = prev;
    }
  });
});

describe('RecoderGitService — indexRepo', () => {
  it('flag ON -> runs analyze, records IndexState with node/edge counts + HEAD sha', async () => {
    const exec = vi.fn<Parameters<EngineExec>, ReturnType<EngineExec>>(async () => ok(ANALYZE_OUT));
    const store = fakeStore();
    const service = new RecoderGitService({
      isEnabled: () => true,
      exec,
      git: fakeGit('abc1234', 'main'),
      store,
      now: () => '2026-06-26T00:00:00.000Z',
    });

    const result = await service.indexRepo(INPUT);

    expect(result.enabled).toBe(true);
    expect(exec).toHaveBeenCalledWith(['analyze', '/repo', '--skip-git'], { cwd: '/repo' });
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.state).toMatchObject({
      repoId: 'r1',
      repoRoot: '/repo',
      branch: 'main',
      lastIndexedSha: 'abc1234',
      nodes: 1234,
      edges: 5678,
      clusters: 12,
      flows: 3,
      status: 'indexed',
      indexedAt: '2026-06-26T00:00:00.000Z',
    });
    expect(store.states.get('r1')?.status).toBe('indexed');
  });

  it('engine exec throws -> fails safe to status:unavailable, never throws', async () => {
    const error = vi.fn();
    const exec: EngineExec = async () => {
      throw new Error('engine bin not found');
    };
    const store = fakeStore();
    const service = new RecoderGitService({
      isEnabled: () => true,
      exec,
      git: fakeGit('abc1234'),
      store,
      logger: { error },
    });

    const result = await service.indexRepo(INPUT);
    expect(result.enabled).toBe(true);
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.state.status).toBe('unavailable');
    expect(result.state.nodes).toBe(0);
    expect(error).toHaveBeenCalledOnce();
  });

  it('engine non-zero exit -> fails safe to unavailable', async () => {
    const service = new RecoderGitService({
      isEnabled: () => true,
      exec: async () => ({ stdout: '', stderr: 'boom', code: 1 }),
      git: fakeGit('abc1234'),
      store: fakeStore(),
      logger: { error: vi.fn() },
    });
    const result = await service.indexRepo(INPUT);
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.state.status).toBe('unavailable');
  });
});

describe('RecoderGitService — status (truthful staleness)', () => {
  async function seed(store: IndexStateStore, sha: string): Promise<void> {
    const service = new RecoderGitService({
      isEnabled: () => true,
      exec: async () => ok(ANALYZE_OUT),
      git: fakeGit(sha),
      store,
    });
    await service.indexRepo(INPUT);
  }

  it('no prior index -> not_indexed', async () => {
    const service = new RecoderGitService({ isEnabled: () => true, exec: async () => ok(''), git: fakeGit('x'), store: fakeStore() });
    const result = await service.status('missing');
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.status).toBe('not_indexed');
    expect(result.fresh).toBe(false);
    expect(result.state).toBeNull();
  });

  it('HEAD matches recorded sha -> fresh (indexed)', async () => {
    const store = fakeStore();
    await seed(store, 'sha-aaa');
    const service = new RecoderGitService({ isEnabled: () => true, exec: async () => ok(''), git: fakeGit('sha-aaa'), store });
    const result = await service.status('r1');
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.fresh).toBe(true);
    expect(result.status).toBe('indexed');
    expect(result.currentSha).toBe('sha-aaa');
  });

  it('HEAD differs from recorded sha -> stale, never claims fresh', async () => {
    const store = fakeStore();
    await seed(store, 'sha-old');
    const service = new RecoderGitService({ isEnabled: () => true, exec: async () => ok(''), git: fakeGit('sha-new'), store });
    const result = await service.status('r1');
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.fresh).toBe(false);
    expect(result.status).toBe('stale');
    expect(result.currentSha).toBe('sha-new');
  });

  it('git unavailable -> not fresh (cannot confirm), degrades safely', async () => {
    const store = fakeStore();
    await seed(store, 'sha-aaa');
    const service = new RecoderGitService({ isEnabled: () => true, exec: async () => ok(''), git: fakeGit(null), store });
    const result = await service.status('r1');
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.fresh).toBe(false);
    expect(result.status).toBe('stale');
  });
});

describe('RecoderGitService — reindexOnPush', () => {
  it('no prior index -> not_indexed (nothing to refresh)', async () => {
    const service = new RecoderGitService({ isEnabled: () => true, exec: async () => ok(''), git: fakeGit('x'), store: fakeStore() });
    const result = await service.reindexOnPush({ repoId: 'r1' });
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.status).toBe('not_indexed');
    expect(result.state).toBeNull();
  });

  it('existing index -> detect-changes + analyze, updates state', async () => {
    const store = fakeStore();
    const calls: string[][] = [];
    const exec: EngineExec = async (args) => {
      calls.push(args);
      return ok(ANALYZE_OUT);
    };
    const seedService = new RecoderGitService({ isEnabled: () => true, exec: async () => ok(ANALYZE_OUT), git: fakeGit('sha1'), store });
    await seedService.indexRepo(INPUT);

    const service = new RecoderGitService({ isEnabled: () => true, exec, git: fakeGit('sha2'), store, now: () => '2026-06-26T01:00:00.000Z' });
    const result = await service.reindexOnPush({ repoId: 'r1' });
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.status).toBe('indexed');
    expect(result.state?.lastIndexedSha).toBe('sha2');
    expect(calls.some((c) => c[0] === 'detect-changes')).toBe(true);
    expect(calls.some((c) => c[0] === 'analyze')).toBe(true);
  });
});

describe('RecoderGitService — domainMap', () => {
  it('maps injected engine JSON into a DomainMap', async () => {
    const engineJson = JSON.stringify({
      groups: [
        { name: 'auth', files: ['a.ts'], entryPoints: ['a.ts'], dependsOn: ['db'] },
        { name: 'db', files: ['db.ts'] },
      ],
      edges: [{ from: 'auth', to: 'db', kind: 'imports' }],
    });
    const store = fakeStore();
    store.set('r1', {
      repoId: 'r1',
      repoRoot: '/repo',
      branch: 'main',
      lastIndexedSha: 'sha',
      indexedAt: 'now',
      nodes: 1,
      edges: 1,
      status: 'indexed',
    });
    const service = new RecoderGitService({ isEnabled: () => true, exec: async () => ok(engineJson), git: fakeGit('sha'), store });

    const result = await service.domainMap('r1');
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.map.domains).toHaveLength(2);
    expect(result.map.domains[0]).toEqual({ name: 'auth', files: ['a.ts'], entryPoints: ['a.ts'], dependsOn: ['db'] });
    expect(result.map.crossEdges).toEqual([{ from: 'auth', to: 'db', kind: 'imports' }]);
  });

  it('engine throws -> fails safe to empty map, never throws', async () => {
    const error = vi.fn();
    const service = new RecoderGitService({
      isEnabled: () => true,
      exec: async () => {
        throw new Error('engine down');
      },
      git: fakeGit('sha'),
      store: fakeStore(),
      logger: { error },
    });
    const result = await service.domainMap('r1');
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.map).toEqual({ repoId: 'r1', domains: [], crossEdges: [] });
    expect(error).toHaveBeenCalledOnce();
  });

  it('engine emits non-JSON -> empty map (no throw)', async () => {
    const service = new RecoderGitService({ isEnabled: () => true, exec: async () => ok('not json at all'), git: fakeGit('sha'), store: fakeStore() });
    const result = await service.domainMap('r1');
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.map.domains).toEqual([]);
  });
});

describe('pure helpers', () => {
  it('parseAnalyzeStats reads N nodes | M edges | C clusters | F flows', () => {
    expect(parseAnalyzeStats('100 nodes | 200 edges | 5 clusters | 2 flows')).toEqual({
      nodes: 100,
      edges: 200,
      clusters: 5,
      flows: 2,
    });
  });

  it('parseAnalyzeStats handles comma thousands and missing fields', () => {
    expect(parseAnalyzeStats('1,000 nodes | 2,500 edges')).toEqual({
      nodes: 1000,
      edges: 2500,
      clusters: undefined,
      flows: undefined,
    });
  });

  it('extractJson tolerates a leading banner line', () => {
    expect(extractJson('banner\n{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('garbage')).toBeUndefined();
  });

  it('projectDomainMap returns empty map for non-object input', () => {
    expect(projectDomainMap('r1', null)).toEqual({ repoId: 'r1', domains: [], crossEdges: [] });
    expect(projectDomainMap('r1', 42)).toEqual({ repoId: 'r1', domains: [], crossEdges: [] });
  });

  it('projectDomainMap accepts a bare array of domains and snake_case keys', () => {
    const map = projectDomainMap('r1', [{ id: 'core', entry_points: ['x.ts'], depends_on: ['util'] }]);
    expect(map.domains).toEqual([{ name: 'core', files: undefined, entryPoints: ['x.ts'], dependsOn: ['util'] }]);
  });
});
