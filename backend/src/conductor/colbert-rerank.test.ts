/**
 * Tests for the conductor colbert-rerank connect seam.
 *
 * These drive the REAL `colbertRerank` / `colbertRerankAvailability` against a
 * stubbed `globalThis.fetch` (the ONLY external IO), asserting the degrade-safe
 * contract: connects only when `COLBERT_RERANK_URL` is set, reorders on a valid
 * `{results:[{index,score}]}` body, and falls back to the ORIGINAL order on every
 * failure path (unset URL, non-2xx, malformed body, transport error) without
 * throwing or fabricating a ranking.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { colbertRerank, colbertRerankAvailability, colbertRerankUrl } from './colbert-rerank.js';

const ENV_KEY = 'COLBERT_RERANK_URL';
const original = process.env[ENV_KEY];

function setUrl(url: string | undefined): void {
  if (url === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = url;
}

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(impl as unknown as typeof fetch));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  setUrl(undefined);
});

afterEach(() => {
  setUrl(original);
  vi.unstubAllGlobals();
});

describe('colbertRerankUrl / availability', () => {
  it('reports unavailable when COLBERT_RERANK_URL is unset', () => {
    expect(colbertRerankUrl()).toBeUndefined();
    expect(colbertRerankAvailability()).toEqual({ available: false });
  });

  it('reports available and strips a trailing slash when set', () => {
    setUrl('http://localhost:8893/');
    expect(colbertRerankUrl()).toBe('http://localhost:8893');
    expect(colbertRerankAvailability()).toEqual({ available: true, url: 'http://localhost:8893' });
  });
});

describe('colbertRerank — degrade-safe', () => {
  it('returns original order without a network call when the URL is unset', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const passages = ['a', 'b', 'c'];
    const result = await colbertRerank('q', passages);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.available).toBe(false);
    expect(result.passages).toEqual(passages);
    expect(result.order).toEqual([0, 1, 2]);
    expect(result.reason).toMatch(/COLBERT_RERANK_URL/);
  });

  it('reorders passages by the returned permutation on a 200 body', async () => {
    setUrl('http://localhost:8893');
    mockFetch(async () =>
      jsonResponse({
        results: [
          { index: 2, score: 9 },
          { index: 0, score: 5 },
          { index: 1, score: 1 },
        ],
      }),
    );
    const result = await colbertRerank('q', ['a', 'b', 'c']);
    expect(result.available).toBe(true);
    expect(result.order).toEqual([2, 0, 1]);
    expect(result.passages).toEqual(['c', 'a', 'b']);
  });

  it('falls back to original order on a 503 (rerank unavailable)', async () => {
    setUrl('http://localhost:8893');
    mockFetch(async () => jsonResponse({ error: 'rerank unavailable' }, 503));
    const result = await colbertRerank('q', ['a', 'b']);
    expect(result.available).toBe(false);
    expect(result.passages).toEqual(['a', 'b']);
    expect(result.reason).toMatch(/503/);
  });

  it('falls back to original order on a malformed / incomplete permutation', async () => {
    setUrl('http://localhost:8893');
    mockFetch(async () => jsonResponse({ results: [{ index: 0, score: 1 }] })); // length mismatch
    const result = await colbertRerank('q', ['a', 'b', 'c']);
    expect(result.available).toBe(false);
    expect(result.passages).toEqual(['a', 'b', 'c']);
    expect(result.reason).toMatch(/malformed/);
  });

  it('falls back to original order (never throws) on a transport error', async () => {
    setUrl('http://localhost:8893');
    mockFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await colbertRerank('q', ['a', 'b']);
    expect(result.available).toBe(false);
    expect(result.passages).toEqual(['a', 'b']);
    expect(result.reason).toMatch(/ECONNREFUSED/);
  });

  it('short-circuits an empty passage list without a network call', async () => {
    setUrl('http://localhost:8893');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await colbertRerank('q', []);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ available: true, passages: [], order: [] });
  });
});
