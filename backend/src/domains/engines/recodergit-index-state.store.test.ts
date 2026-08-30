import { describe, expect, it } from 'vitest';
import { createRecoderGitService, type IndexState } from './recodergit-service.js';
import {
  createRecoderGitIndexStateStore,
  parseStoredIndexState,
  RECODERGIT_INDEX_STATE_NAMESPACE,
  type RecoderGitStateKv,
} from './recodergit-index-state.store.js';

const STATE: IndexState = {
  repoId: 'owner__repo',
  repoRoot: '/work/repo',
  branch: 'main',
  lastIndexedSha: 'abc123',
  indexedAt: '2026-08-30T12:00:00.000Z',
  nodes: 42,
  edges: 81,
  clusters: 4,
  flows: 2,
  status: 'indexed',
};

function memoryKv(): RecoderGitStateKv & { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  const key = (namespace: string, id: string) => `${namespace}:${id}`;
  return {
    rows,
    getJson: async <T>(namespace: string, id: string): Promise<T | null> =>
      (rows.get(key(namespace, id)) as T | undefined) ?? null,
    setJson: async (namespace, id, value) => void rows.set(key(namespace, id), value),
  };
}

describe('createRecoderGitIndexStateStore', () => {
  it('hydrates a new service store from the canonical KV after a backend restart', async () => {
    const kv = memoryKv();
    await createRecoderGitIndexStateStore(kv).set(STATE.repoId, STATE);
    const afterRestart = createRecoderGitIndexStateStore(kv);
    expect(await afterRestart.get(STATE.repoId)).toEqual(STATE);
    expect([...kv.rows.keys()]).toEqual([`${RECODERGIT_INDEX_STATE_NAMESPACE}:${STATE.repoId}`]);
  });

  it('lets a new RecoderGitService report the prior index as fresh', async () => {
    const kv = memoryKv();
    const deps = () => ({
      isEnabled: () => true,
      exec: async () => ({ stdout: '42 nodes | 81 edges | 4 clusters | 2 flows', stderr: '', code: 0 }),
      git: { headSha: async () => 'abc123', currentBranch: async () => 'main' },
      now: () => STATE.indexedAt,
      store: createRecoderGitIndexStateStore(kv),
    });
    const beforeRestart = createRecoderGitService(deps());
    const indexed = await beforeRestart.indexRepo({ repoId: STATE.repoId, repoRoot: STATE.repoRoot });
    expect(indexed.enabled && indexed.state.status).toBe('indexed');

    const afterRestart = createRecoderGitService(deps());
    const status = await afterRestart.status(STATE.repoId);
    expect(status).toMatchObject({
      enabled: true,
      status: 'indexed',
      fresh: true,
      currentSha: 'abc123',
      state: { repoRoot: STATE.repoRoot, nodes: 42, edges: 81 },
    });
  });

  it('migrates a legacy id when a canonical code-intel query supplies aliases', async () => {
    const kv = memoryKv();
    const store = createRecoderGitIndexStateStore(kv);
    await store.set('widget', { ...STATE, repoId: 'widget' });
    const service = createRecoderGitService({
      isEnabled: () => true,
      loadEngineLib: async () => null,
      store,
    });

    await service.codeIntel('definition', 'acme__widget', {
      repoAliases: ['widget'],
    });

    expect(await store.get('acme__widget')).toEqual({
      ...STATE,
      repoId: 'acme__widget',
    });
    expect(kv.rows.get(`${RECODERGIT_INDEX_STATE_NAMESPACE}:acme__widget`)).toMatchObject({
      state: { repoId: 'acme__widget', repoRoot: STATE.repoRoot },
    });
  });

  it('rejects corrupt or cross-repo state instead of claiming an index exists', () => {
    expect(parseStoredIndexState({ version: 1, state: { ...STATE, repoId: 'other' } }, STATE.repoId)).toBeNull();
    expect(parseStoredIndexState({ version: 1, state: { ...STATE, nodes: -1 } }, STATE.repoId)).toBeNull();
    expect(parseStoredIndexState({ version: 2, state: STATE }, STATE.repoId)).toBeNull();
  });

  it('keeps the current process state readable during a KV fault', async () => {
    const kv: RecoderGitStateKv = {
      getJson: async () => { throw new Error('kv down'); },
      setJson: async () => { throw new Error('kv down'); },
    };
    const store = createRecoderGitIndexStateStore(kv);
    await store.set(STATE.repoId, STATE);
    expect(await store.get(STATE.repoId)).toEqual(STATE);
  });
});
