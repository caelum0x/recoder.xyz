import {
  createContextPack,
  type ContextPack,
  type CreateContextPackInput,
} from "@recoder/git-nexus";
import type { RepoIntelPort } from "../ports/repo-intel.port";

/**
 * Default {@link RepoIntelPort}, backed by git-nexus's context-pack.
 *
 * This is the seam where the real ts/gitnexus knowledge-graph engine is merged
 * in (see docs/subsystems/brain.md §repo). The port contract stays stable while
 * the engine behind it gets real; today it wraps `createContextPack` so the
 * Brain keeps its current behavior with zero changes to callers.
 */
export class ContextPackRepoIntel implements RepoIntelPort {
  async contextPack(input: CreateContextPackInput): Promise<ContextPack> {
    return createContextPack(input);
  }
}

/** Construct the default repo-intelligence adapter. */
export function createRepoIntel(): RepoIntelPort {
  return new ContextPackRepoIntel();
}
