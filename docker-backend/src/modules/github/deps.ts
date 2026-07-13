/**
 * Internal seam: the GitHubModule composes three existing engines. This barrel
 * is the ONLY place the module reaches into them, so the composition surface is
 * explicit and the vendored/scattered sources stay swappable behind it.
 *
 * Absorbed sources:
 *   - recodergit-service  → analyze/domainMap in-process code-intel (keeps its
 *                           full exported API; the module composes it).
 *   - pr-review           → pr-swarm-review engine (reviewPR).
 *   - ./gh-ops            → the gh CLI operations the module now OWNS.
 */

export {
  RecoderGitService,
  createRecoderGitService,
  repoIdFromFullName,
  assertSafeRepoId,
} from '../../agent-os/recodergit-service';
export type {
  RecoderGitServiceDeps,
  DomainMap,
  DomainMapEntry,
  IndexState,
  StatusResult,
  ServiceResult,
} from '../../agent-os/recodergit-service';

export { createPrReviewEngine, reviewPullRequest } from '../../conductor/github-engine/pr-review';
export type {
  PrReviewEngine,
  PrReviewEngineDeps,
  ReviewPullRequestInput,
  ReviewPullRequestResult,
  ReviewMode,
} from '../../conductor/github-engine/pr-review';
