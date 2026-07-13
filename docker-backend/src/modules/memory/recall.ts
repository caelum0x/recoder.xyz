/**
 * recall-fusion — the ONE place memory recall is fused. Replaces the logic that
 * used to be inlined in conductor/bundle.ts (two separate, un-deduped sections
 * where colbert only ever saw mem0 rows).
 *
 * Pipeline (each source degrade-safe → [] on any failure, never throws):
 *   1. gather in parallel:
 *        beads   = queryMemories() SQL fast-path, falling back to recallMemories() CLI
 *        mem0    = mem0Search() when a userId scope is present
 *        agentOs = the attached MemoryStore.search() (durable reviewed items)
 *   2. dedupe by normalized text (first occurrence wins; store priority beads→mem0→agentOs)
 *   3. colbert-rerank the WHOLE fused set (not just mem0) — identity order when down
 *   4. tag provenance + return, bounded by limit
 */
import type { MemoryStore } from '@recoder/agent-memory';
import type { MemoryEntry } from '../../conductor/beads-memory.js';
import type { RecalledMemory, RecallOptions, MemoryScopeRef } from './types.js';

/** mem0 record slice the fusion consumes (id + memory text + optional score). */
export interface Mem0Result {
  available: boolean;
  results: Array<{ id?: unknown; memory?: unknown; score?: unknown; [k: string]: unknown }>;
}

/** colbert rerank slice the fusion consumes. */
export interface RerankResultSlice {
  available: boolean;
  order: number[];
}

/**
 * The engine functions the fusion calls. Injectable so recall is unit-testable
 * with mocked stores (no real bd/mem0/colbert). Defaults wire the real engines.
 */
export interface RecallEngines {
  queryMemories: (query: string, opts: { scope?: string; limit?: number }) => Promise<MemoryEntry[] | undefined>;
  recallMemories: (query: string, opts: { scope?: string; limit?: number }) => MemoryEntry[];
  mem0Search: (
    query: string,
    scope: { userId: string; agentId?: string; runId?: string },
    limit: number,
  ) => Promise<Mem0Result>;
  colbertRerank: (query: string, passages: string[]) => Promise<RerankResultSlice>;
  agentOsStore?: MemoryStore;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 5, 1), 50);
}

function beadsEntryToRecalled(entry: MemoryEntry): RecalledMemory {
  const scope = entry.labels.find((l) => l.startsWith('memory-scope:'))?.slice('memory-scope:'.length);
  const desc = entry.description.trim();
  return {
    id: entry.id,
    title: entry.title,
    text: desc ? `${entry.title} — ${desc}` : entry.title,
    store: 'beads',
    status: entry.status || undefined,
    scope,
  };
}

/** beads recall: SQL fast-path first, CLI fallback when the fast-path is down. */
async function gatherBeads(
  query: string,
  scope: string | undefined,
  limit: number,
  engines: RecallEngines,
): Promise<RecalledMemory[]> {
  try {
    const sqlRows = await engines.queryMemories(query, { scope, limit });
    const entries = sqlRows === undefined ? engines.recallMemories(query, { scope, limit }) : sqlRows;
    return entries.map(beadsEntryToRecalled);
  } catch {
    return [];
  }
}

async function gatherMem0(
  query: string,
  opts: RecallOptions,
  limit: number,
  engines: RecallEngines,
): Promise<RecalledMemory[]> {
  if (!opts.userId) return [];
  try {
    const recall = await engines.mem0Search(
      query,
      { userId: opts.userId, agentId: opts.agentId, runId: opts.runId },
      limit,
    );
    if (!recall.available) return [];
    return recall.results
      .map((r): RecalledMemory | undefined => {
        const text = typeof r.memory === 'string' ? r.memory : undefined;
        if (!text) return undefined;
        const id = typeof r.id === 'string' && r.id ? r.id : `mem0:${text.slice(0, 40)}`;
        const score = typeof r.score === 'number' ? r.score : undefined;
        return { id, text, store: 'mem0', score };
      })
      .filter((m): m is RecalledMemory => m !== undefined);
  } catch {
    return [];
  }
}

async function gatherAgentOs(
  query: string,
  scope: string | undefined,
  limit: number,
  engines: RecallEngines,
): Promise<RecalledMemory[]> {
  const store = engines.agentOsStore;
  if (!store) return [];
  try {
    const items = await store.search(query, { scope, limit });
    return items.map((item) => ({
      id: item.memoryId,
      title: item.title,
      text: item.body ? `${item.title} — ${item.body}` : item.title,
      store: 'agent-os' as const,
      scope: item.scope,
      status: item.status,
      evidenceRef: item.evidence?.artifactId,
    }));
  } catch {
    return [];
  }
}

/** Normalize text for dedupe — collapse whitespace + lowercase. */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Keep the first occurrence of each normalized text (gather order = priority). */
function dedupe(items: RecalledMemory[]): RecalledMemory[] {
  const seen = new Set<string>();
  const out: RecalledMemory[] = [];
  for (const item of items) {
    const key = normalize(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function safeRerank(
  rerank: RecallEngines['colbertRerank'],
  query: string,
  passages: string[],
): Promise<RerankResultSlice> {
  try {
    return await rerank(query, passages);
  } catch {
    return { available: false, order: passages.map((_, i) => i) };
  }
}

/**
 * Fuse all three stores into one ranked, deduped, provenance-tagged list.
 * Empty query → []. Any single source failing contributes nothing.
 */
export async function fuseRecall(
  query: string,
  scope: MemoryScopeRef | undefined,
  opts: RecallOptions,
  engines: RecallEngines,
): Promise<RecalledMemory[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = clampLimit(opts.limit);
  const scopeValue = scope?.value;

  const [beads, mem0, agentOs] = await Promise.all([
    gatherBeads(q, scopeValue, limit, engines),
    gatherMem0(q, opts, limit, engines),
    gatherAgentOs(q, scopeValue, limit, engines),
  ]);

  const fused = dedupe([...beads, ...mem0, ...agentOs]);
  if (fused.length === 0) return [];

  const reranked = await safeRerank(engines.colbertRerank, q, fused.map((m) => m.text));
  const ordered =
    reranked.available && reranked.order.length === fused.length
      ? reranked.order.map((i) => fused[i]).filter((m): m is RecalledMemory => m !== undefined)
      : fused;

  return ordered.slice(0, limit);
}
