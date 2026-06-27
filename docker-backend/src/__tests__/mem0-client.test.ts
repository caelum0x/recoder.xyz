import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  scopeToAddOptions,
  scopeToFilters,
  buildSearchOptions,
  buildGetAllOptions,
  resolveEmbedDimension,
  type Mem0Scope,
  type ProviderBlock,
} from '../mem0-client';

/**
 * No-network unit tests for mem0 option shaping.
 *
 * These lock the contract required by the owned `@recoder/mem0`:
 *  - `add()` takes TOP-LEVEL camelCase entity params (userId/agentId/runId).
 *  - `search()` / `getAll()` REJECT top-level entity params and require them
 *    under `filters` using snake_case keys (user_id/agent_id/run_id).
 * The previous code passed `userId` top-level into search()/getAll(), which the
 * library now throws on:
 *   "Top-level entity parameters [userId] are not supported in search()."
 */

const ENTITY_PARAMS = ['user_id', 'agent_id', 'run_id', 'userId', 'agentId', 'runId'];

/** Mirror of @recoder/mem0's guard so the test fails if shaping regresses. */
function topLevelEntityParams(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter((k) => ENTITY_PARAMS.includes(k));
}

describe('mem0 add option shaping', () => {
  it('puts identity at top level in camelCase (add contract)', () => {
    const scope: Mem0Scope = { userId: 'u1', agentId: 'a1', runId: 'r1' };
    expect(scopeToAddOptions(scope)).toEqual({ userId: 'u1', agentId: 'a1', runId: 'r1' });
  });

  it('includes only provided fields plus metadata', () => {
    const scope: Mem0Scope = { userId: 'u1', metadata: { k: 'v' } };
    expect(scopeToAddOptions(scope)).toEqual({ userId: 'u1', metadata: { k: 'v' } });
  });
});

describe('mem0 search/getAll filter shaping', () => {
  it('nests identity under filters in snake_case', () => {
    const scope: Mem0Scope = { userId: 'u1', agentId: 'a1', runId: 'r1' };
    expect(scopeToFilters(scope)).toEqual({ user_id: 'u1', agent_id: 'a1', run_id: 'r1' });
  });

  it('omits optional identity when absent', () => {
    expect(scopeToFilters({ userId: 'u1' })).toEqual({ user_id: 'u1' });
  });

  it('buildSearchOptions never exposes top-level entity params and carries topK', () => {
    const options = buildSearchOptions({ userId: 'u1', agentId: 'a1', runId: 'r1' }, 7);
    expect(topLevelEntityParams(options)).toEqual([]);
    expect(options).toEqual({ filters: { user_id: 'u1', agent_id: 'a1', run_id: 'r1' }, topK: 7 });
  });

  it('buildGetAllOptions never exposes top-level entity params', () => {
    const options = buildGetAllOptions({ userId: 'u1', agentId: 'a1' });
    expect(topLevelEntityParams(options)).toEqual([]);
    expect(options).toEqual({ filters: { user_id: 'u1', agent_id: 'a1' } });
  });
});

describe('embedding dimension resolution (OSS degrade-safety)', () => {
  const ORIGINAL = process.env.MEM0_EMBED_DIMS;
  beforeEach(() => {
    delete process.env.MEM0_EMBED_DIMS;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MEM0_EMBED_DIMS;
    else process.env.MEM0_EMBED_DIMS = ORIGINAL;
  });

  it('resolves known OpenAI embedding dimension (skips network probe)', () => {
    const embedder: ProviderBlock = { provider: 'openai', config: { model: 'text-embedding-3-small' } };
    expect(resolveEmbedDimension(embedder)).toBe(1536);
  });

  it('resolves known Ollama embedding dimension', () => {
    const embedder: ProviderBlock = { provider: 'ollama', config: { model: 'nomic-embed-text' } };
    expect(resolveEmbedDimension(embedder)).toBe(768);
  });

  it('honors MEM0_EMBED_DIMS override over model default', () => {
    process.env.MEM0_EMBED_DIMS = '512';
    const embedder: ProviderBlock = { provider: 'openai', config: { model: 'text-embedding-3-small' } };
    expect(resolveEmbedDimension(embedder)).toBe(512);
  });

  it('ignores invalid override and falls back to model default', () => {
    process.env.MEM0_EMBED_DIMS = 'not-a-number';
    const embedder: ProviderBlock = { provider: 'openai', config: { model: 'text-embedding-3-small' } };
    expect(resolveEmbedDimension(embedder)).toBe(1536);
  });

  it('returns undefined for unknown model (library falls back to its own probe)', () => {
    const embedder: ProviderBlock = { provider: 'openai', config: { model: 'mystery-embed' } };
    expect(resolveEmbedDimension(embedder)).toBeUndefined();
  });
});
