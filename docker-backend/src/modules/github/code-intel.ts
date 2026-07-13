/**
 * code-intel — the recodergit code-knowledge-graph verbs the GitHubModule
 * exposes (analyzeRepo / domainMap), composed over the in-process
 * RecoderGitService (agent-os/recodergit-service.ts). The service keeps its full
 * exported API and remains the single owner of the index lifecycle; this file is
 * the thin projection that maps its results into the module's domain shapes.
 *
 * Degrade-safe: the flag being off (`enabled:false`), a missing dist, or an
 * analyze failure all map to a truthful CodeGraph/RouteMap — never a fabricated
 * graph. Nothing here throws into a request path.
 */

import path from 'node:path';

import { RecoderGitService, repoIdFromFullName } from './deps';
import type { CodeGraph, RouteMap } from './types';

/**
 * Derive a stable, path-safe repoId from a repo path. The basename is the common
 * case (`/work/owner-repo` → `owner-repo`); repoIdFromFullName collapses any
 * unsafe run so no separators/parent-refs survive.
 */
export function repoIdFromPath(repoPath: string): string {
  const base = path.basename(path.resolve(repoPath));
  return repoIdFromFullName(base) || 'repo';
}

/**
 * Build/refresh the code-graph for `repoPath` in-process, projected into a
 * Recoder-owned CodeGraph. `status:'disabled'` when the code-graph flag is off;
 * `status:'unavailable'` when the engine could not index (dist missing / analyze
 * failure). Counts are truthful (0 when unavailable).
 */
export async function analyzeRepo(codeGraph: RecoderGitService, repoPath: string): Promise<CodeGraph> {
  const repoId = repoIdFromPath(repoPath);
  const result = await codeGraph.indexRepo({ repoRoot: repoPath, repoId });
  if (!result.enabled) {
    return {
      repoId,
      repoRoot: repoPath,
      status: 'disabled',
      nodes: 0,
      edges: 0,
      indexedAt: null,
      headSha: null,
    };
  }
  const s = result.state;
  return {
    repoId: s.repoId,
    repoRoot: s.repoRoot,
    status: s.status,
    nodes: s.nodes,
    edges: s.edges,
    clusters: s.clusters,
    flows: s.flows,
    indexedAt: s.indexedAt,
    headSha: s.lastIndexedSha,
  };
}

/**
 * Project the engine's route-map for `repoPath` into Recoder domains. Auto-ensures
 * an index exists first (best-effort) so the map runs against `repoPath` rather
 * than the backend's cwd. Fail-safe → empty map when disabled/unavailable.
 */
export async function domainMap(codeGraph: RecoderGitService, repoPath: string): Promise<RouteMap> {
  const repoId = repoIdFromPath(repoPath);
  const status = await codeGraph.status(repoId);
  if (status.enabled && status.status === 'not_indexed') {
    await codeGraph.indexRepo({ repoRoot: repoPath, repoId });
  }
  const result = await codeGraph.domainMap(repoId);
  if (!result.enabled) {
    return { repoId, domains: [], crossEdges: [] };
  }
  return result.map;
}
