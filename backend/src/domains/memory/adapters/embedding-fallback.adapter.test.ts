/**
 * embedding-fallback.adapter tests — the composite embed rung: config-resolved
 * HTTP primary first, the bootstrap-injected inference seam second, truthful
 * `null` last. Nothing throws; empty input is `[]`, never a provider call.
 */
import { describe, it, expect } from 'vitest';
import type { EmbeddingPort } from '../ports/embedding.port.js';
import { withEmbeddingFallback } from './embedding-fallback.adapter.js';

function port(provider: string, embed: EmbeddingPort['embed']): EmbeddingPort {
  return { provider, embed };
}

const nonePrimary = port('none', async () => null);

describe('withEmbeddingFallback', () => {
  it('returns the primary unchanged when there is no usable fallback', () => {
    expect(withEmbeddingFallback(nonePrimary, null)).toBe(nonePrimary);
    expect(withEmbeddingFallback(nonePrimary, undefined)).toBe(nonePrimary);
    expect(withEmbeddingFallback(nonePrimary, port('none', async () => null))).toBe(nonePrimary);
  });

  it('unconfigured primary + configured fallback → fallback serves and names the provider', async () => {
    const calls: string[][] = [];
    const composed = withEmbeddingFallback(
      nonePrimary,
      port('inference-napi', async (texts) => {
        calls.push(texts);
        return texts.map(() => [1, 2]);
      }),
    );
    expect(composed.provider).toBe('inference-napi');
    await expect(composed.embed(['a', 'b'])).resolves.toEqual([[1, 2], [1, 2]]);
    expect(calls).toEqual([['a', 'b']]);
  });

  it('configured primary wins; the fallback is not consulted', async () => {
    let fallbackCalled = false;
    const composed = withEmbeddingFallback(
      port('openai', async (texts) => texts.map(() => [9])),
      port('inference-napi', async () => {
        fallbackCalled = true;
        return [[0]];
      }),
    );
    expect(composed.provider).toBe('openai');
    await expect(composed.embed(['x'])).resolves.toEqual([[9]]);
    expect(fallbackCalled).toBe(false);
  });

  it('primary degrade (null) falls through to the fallback', async () => {
    const composed = withEmbeddingFallback(
      port('tensorzero', async () => null),
      port('inference-napi', async (texts) => texts.map(() => [7])),
    );
    await expect(composed.embed(['x'])).resolves.toEqual([[7]]);
  });

  it('both rungs failing yields a truthful null (never throws)', async () => {
    const composed = withEmbeddingFallback(
      port('tensorzero', async () => {
        throw new Error('gateway down');
      }),
      port('inference-napi', async () => {
        throw new Error('napi not built');
      }),
    );
    await expect(composed.embed(['x'])).resolves.toBeNull();
  });

  it('empty input is [] and calls no provider', async () => {
    let called = false;
    const composed = withEmbeddingFallback(
      nonePrimary,
      port('inference-napi', async () => {
        called = true;
        return [[1]];
      }),
    );
    await expect(composed.embed([])).resolves.toEqual([]);
    expect(called).toBe(false);
  });
});
