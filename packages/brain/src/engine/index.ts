/** Brain engine — assemble-once cache, revision resolution, token accounting, and degrade-safe source running. */
export { estimateTokens, estimateTokensOfParts } from "./token-estimator";
export { estimateContextTokens } from "./context-tokens";
export {
  buildCacheKey,
  repoKeyPrefix,
  type CacheKeyInput,
} from "./cache-key";
export {
  ContextCache,
  type CacheStats,
  type CacheLookup,
} from "./context-cache";
export {
  resolveRevision,
  NO_HEAD_SENTINEL,
  type GitRunner,
  type ResolveRevisionOptions,
} from "./revision-resolver";
export {
  runSource,
  type SourceOutcome,
  type RunSourceInput,
} from "./source-runner";
export { buildProvenance } from "./provenance-builder";
