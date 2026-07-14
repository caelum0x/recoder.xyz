/**
 * Recoder-owned Context7 docs integration.
 *
 * Wraps the merged @recoder/context7-sdk (live library documentation) for use in
 * the Agent OS layer — agents/instruction compilation can fetch up-to-date docs
 * for a library. Owned code, not an external service SDK. Degrades safely when
 * CONTEXT7_API_KEY is unset (the SDK constructor throws without a key).
 */
import { Context7 } from '@recoder/context7-sdk';

let _client: Context7 | null | undefined;

export function getContext7(): Context7 | null {
  if (_client !== undefined) {
    return _client;
  }
  try {
    _client = new Context7({ apiKey: process.env.CONTEXT7_API_KEY });
  } catch {
    _client = null;
  }
  return _client;
}

export function isContext7Available(): boolean {
  return getContext7() !== null;
}

/** Fetch documentation text for a library/topic via the owned Context7 SDK. */
export async function fetchLibraryDocs(library: string, query: string): Promise<{ available: boolean; docs?: string; reason?: string }> {
  const client = getContext7();
  if (!client) {
    return { available: false, reason: 'context7 not configured (set CONTEXT7_API_KEY)' };
  }
  try {
    const docs = await client.searchLibrary(query, library, { type: 'txt' });
    return { available: true, docs: typeof docs === 'string' ? docs : JSON.stringify(docs) };
  } catch (err) {
    return { available: true, reason: err instanceof Error ? err.message : 'context7 fetch failed' };
  }
}
