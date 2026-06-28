import {
  createContextPack,
  type ContextPack,
  type CreateContextPackInput,
} from './context-pack';
import { buildDependencyGraph, type DependencyGraph } from './dependency-graph';
import { computeImpact } from './impact';
import { buildOwnershipMap } from './ownership';
import { scanRepo } from './repo-scan';

export type RepoIndexer = {
  /**
   * Build a context pack for a task. When the repo on disk is scannable, this
   * walks it, parses real import/require edges, derives ownership, and computes
   * graph-reachability impact before assembling the pack. If scanning fails for
   * any reason, it degrades to the lightweight (path-based) context pack so
   * callers never break.
   */
  contextPack(input: CreateContextPackInput): Promise<ContextPack>;
  /** Index a repo on disk into a populated dependency graph. */
  indexDependencyGraph(repoRoot: string): Promise<DependencyGraph>;
};

/**
 * Create a real repo indexer.
 *
 * The previous implementation returned an empty-graph envelope. This version
 * actually walks the repository, parses TS/JS imports into real edges, builds an
 * ownership map (CODEOWNERS or path heuristics), and computes a reachability
 * impact report keyed off the task's target paths.
 */
export function createRepoIndexer(): RepoIndexer {
  return {
    async indexDependencyGraph(repoRoot: string): Promise<DependencyGraph> {
      const scan = await scanRepo(repoRoot);
      const resolvedEdges = scan.edges
        .filter((edge): edge is typeof edge & { to: string } => edge.to !== null)
        .map((edge) => ({ from: edge.from, to: edge.to }));
      return buildDependencyGraph(repoRoot, scan.files, resolvedEdges);
    },

    async contextPack(input: CreateContextPackInput): Promise<ContextPack> {
      // If the caller already supplied a graph + ownership, respect them.
      if (input.dependencyGraph && input.ownershipMap) {
        return createContextPack(input);
      }

      try {
        const scan = await scanRepo(input.repoRoot);
        const resolvedEdges = scan.edges
          .filter((edge): edge is typeof edge & { to: string } => edge.to !== null)
          .map((edge) => ({ from: edge.from, to: edge.to }));
        const dependencyGraph =
          input.dependencyGraph ?? buildDependencyGraph(input.repoRoot, scan.files, resolvedEdges);
        const ownershipMap = input.ownershipMap ?? (await buildOwnershipMap(input.repoRoot, scan.files));

        const pack = createContextPack({
          ...input,
          dependencyGraph,
          ownershipMap,
        });

        // Enrich the impact report with real reachability: any file that
        // transitively imports a changed target path is impacted.
        const impact = computeImpact({
          graph: dependencyGraph,
          changedPaths: input.task.targetPaths,
        });
        const impactedPackages = new Set(pack.impactReport.impactedPackages);
        for (const file of impact.impactedFiles) {
          const pkg = file.split('/').slice(0, 2).join('/');
          if (pkg) {
            impactedPackages.add(pkg);
          }
        }

        return {
          ...pack,
          impactReport: {
            ...pack.impactReport,
            impactedPackages: [...impactedPackages].sort(),
            changedFileRisks: [
              ...pack.impactReport.changedFileRisks,
              ...impact.impactedFiles.map((path) => ({
                path,
                risk: 'medium' as const,
                reason: 'Transitively imports a changed target path (graph reachability).',
              })),
            ],
          },
        };
      } catch {
        // Disk/scan failure — degrade gracefully to the path-based pack.
        return createContextPack(input);
      }
    },
  };
}
