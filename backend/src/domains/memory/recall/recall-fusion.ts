/**
 * recall/recall-fusion — THE highest-value memory operation: fuse the control
 * plane's several memory sources into one truthful, deduped, provenance-tagged
 * recall for a query.
 *
 * Pipeline (every stage degrade-safe):
 *   gather(mem0 ∪ beads ∪ candidates ∪ items)  ← each source independently, tenant-scoped
 *     → normalize to `RecalledMemory` + `Provenance`
 *     → rerank (ColBERT late-interaction; identity order when the sidecar is down)
 *     → dedupe (collapse near-duplicate facts, keep best-ranked copy)
 *     → rank + limit
 *     → FusionResult { memories, sources, reranker }
 *
 * TRUTH INVARIANTS:
 *  - A source that is absent/faulted is reported in `sources` with
 *    `available:false` + a reason and contributes ZERO memories — never a
 *    fabricated one. `candidates` + `items` come from the store-of-record and are
 *    always attempted; `mem0` + `beads` are mirrors attempted only when up.
 *  - `reranker` reflects which reranker ACTUALLY ran (`colbert` vs `identity`).
 *  - Every returned memory carries a `provenance { source, ref, score, scope? }`
 *    pointing at the real source id — nothing is anonymous.
 */
import type { Logger } from '../../../shared/logger.js';
import type { MemoryConfig } from '../config.js';
import type { Mem0Port } from '../ports/mem0.port.js';
import type { BeadsMemoryPort } from '../ports/beads-memory.port.js';
import type { ColbertSearchPort } from '../ports/colbert-search.port.js';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import type {
  FusionResult,
  MemorySource,
  Provenance,
  RecalledMemory,
  RecallQuery,
  SourceAvailability,
} from '../types.js';
import { dedupeMemories } from './dedupe.js';
import { lexicalScore, rerankMemories, type PassageReranker } from './rank.js';

/** The public recall seam other domains (brain, pal, conductor launch) consume. */
export interface RecallService {
  /** Fuse all memory sources for `query` into one deduped, ranked recall. */
  recall(query: RecallQuery): Promise<FusionResult>;
}

export interface RecallServiceDeps {
  readonly mem0: Mem0Port;
  readonly beads: BeadsMemoryPort;
  readonly repository: MemoryRepository;
  readonly reranker: PassageReranker;
  readonly config: MemoryConfig;
  readonly logger: Logger;
  /**
   * OPTIONAL FIRST-STAGE ColBERT retriever over a memory index. When present +
   * configured, its late-interaction hits become a parallel recall source (with
   * `colbert` provenance). Absent / unconfigured / unbuilt index → the `colbert`
   * source reports `down` and contributes ZERO memories (degrade-truthful).
   */
  readonly colbertSearch?: ColbertSearchPort;
  /** The ColBERT collection recall searches; defaults to `config.mem0Collection`. */
  readonly colbertCollection?: string;
}

/** A per-source gather outcome: the memories it produced + its truthful availability. */
interface SourceHarvest {
  readonly memories: readonly RecalledMemory[];
  readonly availability: SourceAvailability;
}

function up(source: MemorySource): SourceAvailability {
  return { source, available: true };
}

function down(source: MemorySource, reason: string): SourceAvailability {
  return { source, available: false, reason };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Clamp a raw score into `[0, 1]`; non-finite → 0 (never a fabricated confidence). */
function clampScore(score: number | undefined, fallback: number): number {
  const value = typeof score === 'number' && Number.isFinite(score) ? score : fallback;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function provenance(source: MemorySource, ref: string, score: number, scope?: string): Provenance {
  return scope ? { source, ref, score, scope } : { source, ref, score };
}

/**
 * Build the recall fusion service. Each gather is wrapped so one source's fault
 * degrades that source only (reported in `sources`), never the whole recall.
 */
export function createRecallService(deps: RecallServiceDeps): RecallService {
  const { mem0, beads, repository, reranker, config, logger, colbertSearch } = deps;
  const colbertCollection = deps.colbertCollection?.trim() || config.mem0Collection;

  const perSourceLimit = (query: RecallQuery): number => query.limit ?? config.recallLimit;

  /** mem0 semantic memory — attempted always; degrades to empty when unconfigured. */
  async function gatherMem0(query: RecallQuery): Promise<SourceHarvest> {
    try {
      const scope: { userId: string; metadata?: Record<string, unknown> } = { userId: query.userId };
      if (query.scope) scope.metadata = { scope: query.scope };
      const results = await mem0.search(query.query, scope, perSourceLimit(query));
      if (results.length === 0) {
        // Truthful: an empty result from an up source is still "available".
        const health = await mem0.health();
        return {
          memories: [],
          availability: health.available ? up('mem0') : down('mem0', health.reason ?? 'mem0 unavailable'),
        };
      }
      const memories = results.map<RecalledMemory>((r) => ({
        id: r.id,
        body: r.memory,
        provenance: provenance('mem0', r.id, clampScore(r.score, 0.6), query.scope),
      }));
      return { memories, availability: up('mem0') };
    } catch (err) {
      logger.warn({ err: errText(err) }, 'recall: mem0 source faulted');
      return { memories: [], availability: down('mem0', errText(err)) };
    }
  }

  /** beads issue-graph shared memory — only when the `bd` seam is resolvable. */
  function gatherBeads(query: RecallQuery): SourceHarvest {
    if (!beads.available()) {
      return { memories: [], availability: down('beads', 'bd binary/DB unavailable') };
    }
    try {
      const options: { scope?: string; limit?: number } = { limit: perSourceLimit(query) };
      if (query.scope) options.scope = query.scope;
      const entries = beads.recall(query.query, options);
      const memories = entries.map<RecalledMemory>((e) => ({
        id: e.id,
        title: e.title,
        body: e.body,
        provenance: provenance('beads', e.id, lexicalScore(query.query, `${e.title} ${e.body}`), query.scope),
      }));
      return { memories, availability: up('beads') };
    } catch (err) {
      logger.warn({ err: errText(err) }, 'recall: beads source faulted');
      return { memories: [], availability: down('beads', errText(err)) };
    }
  }

  /** Ephemeral candidate wisps from the store-of-record (lexically matched). */
  async function gatherCandidates(query: RecallQuery): Promise<SourceHarvest> {
    try {
      const candidates = await repository.listCandidates(query.userId, query.scope);
      const scored = candidates
        .map((c) => ({ c, score: lexicalScore(query.query, `${c.title} ${c.body}`) }))
        .filter((entry) => entry.score > 0)
        .map<RecalledMemory>(({ c, score }) => ({
          id: c.candidateId,
          title: c.title,
          body: c.body,
          provenance: provenance('candidates', c.candidateId, score, c.scope),
        }));
      return { memories: scored, availability: up('candidates') };
    } catch (err) {
      logger.warn({ err: errText(err) }, 'recall: candidate store faulted');
      return { memories: [], availability: down('candidates', errText(err)) };
    }
  }

  /** Durable accepted items from the store-of-record (the "store items" recall). */
  async function gatherItems(query: RecallQuery): Promise<SourceHarvest> {
    try {
      const items = await repository.listItems(query.userId);
      const scored = items
        .filter((i) => i.status === 'active')
        .filter((i) => !query.scope || i.scope === query.scope)
        .map((i) => ({ i, score: lexicalScore(query.query, `${i.title} ${i.body}`) }))
        .filter((entry) => entry.score > 0)
        .map<RecalledMemory>(({ i, score }) => ({
          id: i.memoryId,
          title: i.title,
          body: i.body,
          provenance: provenance('items', i.memoryId, score, i.scope),
        }));
      return { memories: scored, availability: up('items') };
    } catch (err) {
      logger.warn({ err: errText(err) }, 'recall: item store faulted');
      return { memories: [], availability: down('items', errText(err)) };
    }
  }

  /**
   * ColBERT late-interaction memory search — a FIRST-STAGE recall source that
   * finds facts the lexical/vector sources miss. Only attempted when a configured
   * search port is wired; an unbuilt index or absent torch degrades that source
   * only (reported `down`, ZERO memories — never a fabricated recall). Raw MaxSim
   * scores are normalized against the best hit into a truthful `[0,1]` confidence.
   */
  async function gatherColbert(query: RecallQuery): Promise<SourceHarvest> {
    if (!colbertSearch || !colbertSearch.configured()) {
      return { memories: [], availability: down('colbert', 'colbert search not configured') };
    }
    try {
      const result = await colbertSearch.search(colbertCollection, query.query, perSourceLimit(query));
      if (!result.available) {
        return { memories: [], availability: down('colbert', result.reason ?? 'colbert search unavailable') };
      }
      const topScore = result.hits[0]?.score ?? 0;
      const memories = result.hits.map<RecalledMemory>((hit, i) => {
        // Best-first hits → a relative, truthful confidence (never fabricated):
        // normalize against the top MaxSim; degrade to rank order if it is ≤ 0.
        const rel = topScore > 0 ? hit.score / topScore : 1 - i / Math.max(result.hits.length, 1);
        const ref = hit.pid !== undefined ? `pid:${hit.pid}` : `rank:${i}`;
        return {
          id: `colbert:${colbertCollection}:${ref}`,
          body: hit.text,
          provenance: provenance('colbert', ref, clampScore(rel, 0.5), query.scope),
        };
      });
      return { memories, availability: up('colbert') };
    } catch (err) {
      logger.warn({ err: errText(err) }, 'recall: colbert source faulted');
      return { memories: [], availability: down('colbert', errText(err)) };
    }
  }

  return {
    async recall(query: RecallQuery): Promise<FusionResult> {
      const trimmed = query.query?.trim() ?? '';
      if (trimmed.length === 0) {
        // Fail fast, truthful: nothing to recall for an empty query.
        return {
          memories: [],
          sources: [
            down('mem0', 'empty query'),
            down('beads', 'empty query'),
            down('candidates', 'empty query'),
            down('items', 'empty query'),
            down('colbert', 'empty query'),
          ],
          reranker: 'identity',
        };
      }

      const [mem0Harvest, candidateHarvest, itemHarvest, colbertHarvest] = await Promise.all([
        gatherMem0(query),
        gatherCandidates(query),
        gatherItems(query),
        gatherColbert(query),
      ]);
      const beadsHarvest = gatherBeads(query);

      const sources: SourceAvailability[] = [
        mem0Harvest.availability,
        beadsHarvest.availability,
        candidateHarvest.availability,
        itemHarvest.availability,
        colbertHarvest.availability,
      ];

      const pooled: RecalledMemory[] = [
        ...mem0Harvest.memories,
        ...beadsHarvest.memories,
        ...candidateHarvest.memories,
        ...itemHarvest.memories,
        ...colbertHarvest.memories,
      ];

      if (pooled.length === 0) {
        return { memories: [], sources, reranker: 'identity' };
      }

      const reranked = await rerankMemories(trimmed, pooled, reranker);
      const deduped = dedupeMemories(reranked.ordered, config.dedupeThreshold);
      const limit = query.limit ?? config.recallLimit;
      const memories = deduped.slice(0, limit);

      return { memories, sources, reranker: reranked.reranker };
    },
  };
}
