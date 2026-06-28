import { createHash } from "node:crypto";
import type { BrainQuery } from "../domain/brain-query";
import type { Revision } from "../domain/revision";

/**
 * The content-addressed key for one assembled context. It is the spine of
 * "assemble once, read many": two reads that would produce the same context
 * resolve to the same key, so the second is a cache HIT that re-spends zero
 * source calls. The key folds in exactly the inputs that change the assembled
 * material:
 *
 *   - repoRoot   — different repos never collide
 *   - taskId     — the compiled task (when assembling around a TaskSpec) so two
 *                  tasks over the same repo+revision get distinct contexts
 *   - task text  — the free-text query when there is no taskId
 *   - focusFiles — the agent's focus set (sorted; order-independent)
 *   - limit      — per-source cap (changes how much material is gathered)
 *   - revision   — git HEAD sha + dirty flag, so a NEW COMMIT invalidates the
 *                  stale repo intelligence by yielding a different key
 *   - sourceSet  — which sources are enabled (a different fusion => a different
 *                  context), so toggling a source never serves a stale shape
 *
 * The hash is sha-256 over a canonical JSON of those inputs; canonicalization
 * (sorted arrays, fixed field order) makes the key stable regardless of input
 * ordering. A short `repoRoot` prefix is kept readable so a store can scope/scan
 * by repo (clearRepo) without decoding the hash.
 */

/** The fields that materially change an assembled context. */
export interface CacheKeyInput {
  readonly repoRoot: string;
  /** The compiled task id when assembling around a TaskSpec; undefined for free-text. */
  readonly taskId?: string;
  /** The free-text query (used when there is no taskId). */
  readonly task: string;
  readonly focusFiles: readonly string[];
  readonly limit: number;
  readonly revision: Revision;
  /** Which sources are enabled for this assembly (stable order). */
  readonly sourceSet: readonly string[];
}

/** Stable sha-256 hex of a canonical JSON payload. */
function stableHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Encode a repoRoot into a filesystem/store-safe, collision-resistant prefix so
 * the human-readable part of the key cannot break a store that scans by prefix.
 */
function repoPrefix(repoRoot: string): string {
  // A short hash keeps the prefix bounded + safe while staying repo-scoped.
  return createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
}

/**
 * Build the content-addressed cache key. Pure + deterministic: identical inputs
 * (in any array order) always yield the same key; any material change (a new
 * commit -> new revision.head, a toggled source, a different focus set) yields a
 * different key.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  const canonical = {
    repoRoot: input.repoRoot,
    taskId: input.taskId ?? null,
    task: input.task,
    focusFiles: [...input.focusFiles].sort(),
    limit: input.limit,
    head: input.revision.head,
    dirty: input.revision.dirty,
    sourceSet: [...input.sourceSet].sort(),
  };
  return `brain:${repoPrefix(input.repoRoot)}:${stableHash(canonical)}`;
}

/**
 * The repo-scoped prefix a store uses to clear every key for a repo (refresh /
 * head-change invalidation). Matches the prefix {@link buildCacheKey} emits.
 */
export function repoKeyPrefix(repoRoot: string): string {
  return `brain:${repoPrefix(repoRoot)}:`;
}
