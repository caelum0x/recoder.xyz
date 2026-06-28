import type { DependencyGraph } from './dependency-graph';

/**
 * Real graph-reachability impact analysis.
 *
 * Given a dependency graph whose edges point from an importer to the file it
 * imports (`from imports to`), the set of files impacted by a change to some
 * target files is the set of files that can *reach* those targets by following
 * edges forward — i.e. the reverse-reachable set in the import graph. If A
 * imports B and B changes, A is impacted; so we walk the reversed edges.
 */

/** Build a reverse adjacency map: target file -> files that import it. */
function buildReverseAdjacency(graph: DependencyGraph): Map<string, string[]> {
  const reverse = new Map<string, string[]>();
  for (const edge of graph.edges) {
    // Only structural import-style edges contribute to change propagation.
    if (edge.kind !== 'imports' && edge.kind !== 'depends_on') {
      continue;
    }
    const dependents = reverse.get(edge.to);
    if (dependents) {
      dependents.push(edge.from);
    } else {
      reverse.set(edge.to, [edge.from]);
    }
  }
  return reverse;
}

export type ImpactQuery = {
  graph: DependencyGraph;
  /** Repo-relative paths that changed. */
  changedPaths: readonly string[];
  /** Maximum transitive depth to walk. Defaults to unbounded. */
  maxDepth?: number;
};

export type ImpactResult = {
  /** Paths supplied as changed that exist as nodes/edge endpoints in the graph. */
  seeds: string[];
  /** Files transitively impacted by the changed paths (excludes the seeds). */
  impactedFiles: string[];
};

/**
 * Compute the transitively impacted files for a set of changed paths via
 * reverse reachability over the import graph.
 */
export function computeImpact(query: ImpactQuery): ImpactResult {
  const { graph, changedPaths } = query;
  const maxDepth = query.maxDepth ?? Number.POSITIVE_INFINITY;
  const reverse = buildReverseAdjacency(graph);

  const knownNodes = new Set<string>(graph.nodes);
  for (const edge of graph.edges) {
    knownNodes.add(edge.from);
    knownNodes.add(edge.to);
  }

  const seeds = [...new Set(changedPaths)].filter((p) => knownNodes.has(p));
  const impacted = new Set<string>();
  // BFS over reversed edges.
  let frontier: Array<{ path: string; depth: number }> = seeds.map((path) => ({ path, depth: 0 }));
  const visited = new Set<string>(seeds);

  while (frontier.length > 0) {
    const next: Array<{ path: string; depth: number }> = [];
    for (const { path, depth } of frontier) {
      if (depth >= maxDepth) {
        continue;
      }
      const dependents = reverse.get(path);
      if (!dependents) {
        continue;
      }
      for (const dependent of dependents) {
        if (visited.has(dependent)) {
          continue;
        }
        visited.add(dependent);
        impacted.add(dependent);
        next.push({ path: dependent, depth: depth + 1 });
      }
    }
    frontier = next;
  }

  return {
    seeds: seeds.sort(),
    impactedFiles: [...impacted].sort(),
  };
}

/**
 * Convenience: return only the impacted dependent files for the given changed
 * paths. This replaces the prior path-passthrough behavior with real graph
 * reachability.
 */
export function dependentsOf(graph: DependencyGraph, changedPaths: readonly string[]): string[] {
  return computeImpact({ graph, changedPaths }).impactedFiles;
}
