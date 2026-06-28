import {
  createRepoIndexer,
  type ContextPack,
  type CreateContextPackInput,
  type RepoIndexer,
} from "@recoder/recodergit";
import type { RepoIntelPort } from "../ports/repo-intel.port";

/**
 * Default {@link RepoIntelPort}, backed by the real RecoderGit repo indexer.
 *
 * This is the seam where the ts/recodergit knowledge-graph engine is merged in
 * (see docs/subsystems/brain.md §repo). The port contract stays stable while the
 * engine behind it gets real: {@link RepoIndexer.contextPack} now walks the repo
 * on disk, parses TS/JS import edges into a populated dependency graph, derives
 * ownership, and computes graph-reachability impact — so the Brain's repo
 * context is non-empty instead of an empty-graph envelope.
 */
export class ContextPackRepoIntel implements RepoIntelPort {
  private readonly indexer: RepoIndexer;

  constructor(indexer: RepoIndexer = createRepoIndexer()) {
    this.indexer = indexer;
  }

  async contextPack(input: CreateContextPackInput): Promise<ContextPack> {
    return this.indexer.contextPack(input);
  }
}

/** Construct the default repo-intelligence adapter. */
export function createRepoIntel(): RepoIntelPort {
  return new ContextPackRepoIntel();
}
