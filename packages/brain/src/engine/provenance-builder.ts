import type { Provenance, SourceProvenance } from "../domain/provenance";

/**
 * Assemble the final {@link Provenance} from per-source entries: keep them in a
 * stable order (repo, memory, docs, passages, tasks, activity) and derive the `degraded`
 * view (the subset that did not contribute) so a caller can answer "which sources
 * are dark?" without re-walking the array. Truthful by construction — it only
 * surfaces what the source runner observed.
 */

const SOURCE_ORDER: ReadonlyArray<SourceProvenance["source"]> = [
  "repo",
  "memory",
  "docs",
  "passages",
  "tasks",
  "activity",
];

export function buildProvenance(
  entries: readonly SourceProvenance[],
): Provenance {
  const ordered = [...entries].sort(
    (a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source),
  );
  const degraded = ordered.filter((entry) => !entry.contributed);
  return { sources: ordered, degraded };
}
