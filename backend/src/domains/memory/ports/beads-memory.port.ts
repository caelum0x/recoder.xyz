/**
 * `BeadsMemoryPort` — the issue-graph SHARED memory seam (beads/`bd`, Dolt-
 * versioned, candidate→promote lifecycle). The concrete impl
 * (`adapters/beads-memory.adapter.ts`) wraps `conductor/beads-memory.ts`.
 *
 * DEGRADE CONTRACT: when `bd` is unavailable (binary missing, DB locked/
 * migrating) every method returns `undefined`/`[]`/`false` with a truthful
 * warn — never throws, never fabricates a memory.
 */

/** A memory entry recalled from the issue graph (candidate or promoted). */
export interface BeadsMemoryEntry {
  /** bd issue id (provenance ref). */
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly status: string;
  readonly labels: readonly string[];
}

/** Input to remember a candidate wisp in the issue graph. */
export interface BeadsRememberInput {
  readonly title: string;
  readonly body: string;
  /** Optional scope label suffix (`memory-scope:<scope>`). */
  readonly scope?: string;
  /** Optional bd id this memory was discovered from (adds a dep edge). */
  readonly discoveredFrom?: string;
}

/** The issue-graph memory port. */
export interface BeadsMemoryPort {
  /** True when the `bd` seam is configured to connect (binary resolvable). */
  available(): boolean;
  /** Persist a candidate wisp; returns the bd id, or `undefined` when down. */
  remember(input: BeadsRememberInput): BeadsMemoryEntry['id'] | undefined;
  /** Recall candidates + promoted memories matching `query`. `[]` when down. */
  recall(
    query: string,
    options?: { scope?: string; limit?: number }
  ): readonly BeadsMemoryEntry[];
  /** Promote a wisp into durable Dolt-versioned memory. `false` when down. */
  promote(id: string): boolean;
  /** Append evidence to an existing memory/work item. `false` when down. */
  note(id: string, text: string): boolean;
  /**
   * OPTIONAL durability flush (maintenance driver only). Commits the working-set
   * of the Dolt-versioned issue graph (`bd vc commit`) so note/update/close
   * mutations become a durable, versioned checkpoint. Degrade-safe: `bd` down →
   * `{ committed:false, reason }`; a clean graph → `{ committed:false }` with a
   * "nothing to commit" reason. Never throws, never fabricates a commit.
   */
  flush?(message?: string): BeadsFlushResult;
}

/** The truthful outcome of a beads durability flush. */
export interface BeadsFlushResult {
  /** True only when `bd vc commit` created a new Dolt commit. */
  readonly committed: boolean;
  /** The new commit hash when one was created. */
  readonly hash?: string;
  /** Truthful reason when nothing was committed (clean graph, or `bd` down). */
  readonly reason?: string;
}
