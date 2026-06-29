/**
 * The Brain's fused sources: repo intelligence, semantic recall, external docs,
 * the task graph, desktop activity, and passage-level RAG retrieval. `passages`
 * is additive and only ever recorded when the vector-store port is wired, so it
 * never appears in the degraded set merely by being absent.
 */
export type BrainSourceKind =
  | "repo"
  | "memory"
  | "docs"
  | "tasks"
  | "activity"
  | "passages";

/** Why a source did not contribute (truthful, never fabricated). */
export type DegradeReason =
  | "not_configured" // no port wired / no key / no base URL
  | "unavailable" // port wired but threw / unreachable
  | "empty"; // port ran cleanly but returned nothing

/**
 * One source's contribution to an assembled context, recorded truthfully so the
 * product can report which sources actually lit up vs degraded. This satisfies
 * the repo rule: never imply a source succeeded without evidence.
 */
export interface SourceProvenance {
  /** Which source this entry describes. */
  readonly source: BrainSourceKind;
  /** True iff the source ran and returned at least one item. */
  readonly contributed: boolean;
  /** How many items the source contributed (0 when degraded/empty). */
  readonly itemCount: number;
  /** When `contributed` is false, why; omitted when it contributed. */
  readonly degradeReason?: DegradeReason;
  /** Human-readable, actionable detail (e.g. "mem0 not configured"). */
  readonly detail: string;
}

/**
 * The full provenance of an assembled context: one entry per source, in a stable
 * order. `degraded` is the subset that did not contribute, for a fast truthful
 * "which sources are dark" read without re-walking the array.
 */
export interface Provenance {
  /** One entry per source, stable order: repo, memory, docs, tasks, activity. */
  readonly sources: readonly SourceProvenance[];
  /** Convenience view: the sources that did not contribute. */
  readonly degraded: readonly SourceProvenance[];
}
