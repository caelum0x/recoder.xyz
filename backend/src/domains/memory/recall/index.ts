/**
 * recall barrel — the fusion recall surface + its pure helpers.
 */
export { createRecallService } from './recall-fusion.js';
export type { RecallService, RecallServiceDeps } from './recall-fusion.js';
export { dedupeMemories, jaccard, tokenSet } from './dedupe.js';
export { lexicalScore, sortByScore, rerankMemories } from './rank.js';
export type { PassageReranker, RerankOutcome } from './rank.js';
export { applyScopeBoost, DEFAULT_RECENCY_WINDOW_MS } from './scope-boost.js';
export type { ScopeBoostContext } from './scope-boost.js';
