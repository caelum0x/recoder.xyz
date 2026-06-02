/**
 * @module context7-client
 *
 * Up-to-date library documentation for coding agents, via Context7
 * (upstash/context7) — the "docs/context for coding agents" pillar. Lets agents
 * code against current library APIs instead of stale training data.
 *
 * Plain HTTP against the public Context7 API (no SDK dependency). Works on the
 * free tier; set `CONTEXT7_API_KEY` for higher rate limits. Fail-safe: network
 * or quota errors return a truthful error field rather than throwing.
 */

import { createLogger } from './logger';

const logger = createLogger('context7-client');

const API_BASE = process.env.CONTEXT7_API_URL || 'https://context7.com/api';

export interface Context7Library {
  id: string;
  title?: string;
  description?: string;
  totalTokens?: number;
  totalSnippets?: number;
  stars?: number;
  trustScore?: number;
  [key: string]: unknown;
}

export interface Context7SearchResult {
  results: Context7Library[];
  error?: string;
}

export interface Context7DocsResult {
  libraryId: string;
  data: string;
  error?: string;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Context7-Source': 'recoder-docker-backend',
  };
  if (process.env.CONTEXT7_API_KEY) {
    headers.Authorization = `Bearer ${process.env.CONTEXT7_API_KEY}`;
  }
  return headers;
}

export function context7Health(): { available: boolean; apiKeyPresent: boolean; base: string } {
  return {
    available: true, // public API; reachable without a key (rate-limited)
    apiKeyPresent: !!process.env.CONTEXT7_API_KEY,
    base: API_BASE,
  };
}

/**
 * Resolve a library name to Context7-compatible library IDs, ranked for the
 * given task query.
 */
export async function resolveLibrary(
  libraryName: string,
  query = '',
  timeoutMs = 15_000,
): Promise<Context7SearchResult> {
  try {
    const url = new URL(`${API_BASE}/v2/libs/search`);
    url.searchParams.set('query', query || libraryName);
    url.searchParams.set('libraryName', libraryName);

    const response = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { results: [], error: `Context7 search failed (${response.status})` };
    }
    const data = (await response.json()) as Context7SearchResult;
    return { results: Array.isArray(data?.results) ? data.results : [], error: data?.error };
  } catch (err) {
    logger.warn({ err, libraryName }, 'Context7 resolveLibrary failed');
    return { results: [], error: err instanceof Error ? err.message : 'Context7 search failed' };
  }
}

/**
 * Fetch reranked documentation context for a Context7-compatible library ID,
 * focused on the given natural-language query.
 */
export async function getLibraryDocs(
  libraryId: string,
  query: string,
  timeoutMs = 20_000,
): Promise<Context7DocsResult> {
  try {
    const url = new URL(`${API_BASE}/v2/context`);
    url.searchParams.set('query', query);
    url.searchParams.set('libraryId', libraryId);

    const response = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { libraryId, data: '', error: `Context7 docs fetch failed (${response.status})` };
    }
    const text = await response.text();
    return { libraryId, data: text };
  } catch (err) {
    logger.warn({ err, libraryId }, 'Context7 getLibraryDocs failed');
    return { libraryId, data: '', error: err instanceof Error ? err.message : 'Context7 docs fetch failed' };
  }
}

/**
 * Convenience: resolve the best-matching library for a name and return its docs
 * for the query in one call — ready to inject into an agent's system context.
 */
export async function getDocsForQuery(params: {
  libraryName: string;
  query: string;
  timeoutMs?: number;
}): Promise<{ resolved?: Context7Library; docs?: string; error?: string }> {
  const search = await resolveLibrary(params.libraryName, params.query, params.timeoutMs);
  if (search.error && search.results.length === 0) {
    return { error: search.error };
  }
  const best = search.results[0];
  if (!best) {
    return { error: `No Context7 library matched "${params.libraryName}"` };
  }
  const docs = await getLibraryDocs(best.id, params.query, params.timeoutMs);
  if (docs.error) {
    return { resolved: best, error: docs.error };
  }
  return { resolved: best, docs: docs.data };
}
