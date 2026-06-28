import type { TaskSpec } from '@recoder/agent-os';
import {
  computeImpact,
  createRepoIndexer,
  ownersForPath,
  relatedTestsForPaths,
  scanRepo,
  type ContextPack,
  type DependencyGraph,
  type ImpactResult,
  type RepoIndexer,
} from '@recoder/recodergit';
import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

export const gitNexusMcpServer: McpServerRegistration = {
  serverId: 'recoder.git_nexus',
  kind: 'git_nexus',
  displayName: 'Recoder Git Nexus',
  transport: 'http',
  enabled: true,
  toolNames: [
    'git_nexus.search_code',
    'git_nexus.get_package_map',
    'git_nexus.get_owners',
    'git_nexus.get_related_tests',
    'git_nexus.impact_report',
    'git_nexus.context_pack',
  ],
};

/**
 * The host injects how Git Nexus tools resolve a repository on disk. The package
 * stays runtime-agnostic: it never assumes the backend's filesystem layout or a
 * default repo root. The host (docker-backend) supplies the concrete resolver.
 */
export type GitNexusPort = {
  /**
   * Resolve a repo root to an absolute, scannable directory. May validate that
   * the path exists / is allowed. Return a string the recodergit indexer can
   * walk. Throw a truthful error when the repo is unknown/unconfigured.
   */
  resolveRepoRoot(input: { repo?: string; spaceId?: string }): Promise<string> | string;
};

export type RegisterGitNexusOptions = {
  /** Real recodergit indexer. Defaults to the package's on-disk indexer. */
  indexer?: RepoIndexer;
};

/**
 * Register the REAL Git Nexus tool handlers, backed by the `@recoder/recodergit`
 * indexer. `context_pack`/`impact_report` walk the repo on disk, parse real
 * import edges, and compute graph-reachability impact. `search_code` greps the
 * indexed source files. Every handler degrades truthfully (empty results, not
 * fabricated success) when the repo cannot be resolved or scanned.
 */
export function registerGitNexusMcpTools(
  router: McpToolRouter,
  port: GitNexusPort,
  options: RegisterGitNexusOptions = {},
): void {
  const indexer = options.indexer ?? createRepoIndexer();

  router.register(gitNexusMcpServer, 'git_nexus.context_pack', async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const task = buildTaskSpec(input);
    const pack = await indexer.contextPack({ task, repoRoot });
    return {
      content: pack,
      metadata: contextPackMetadata(pack),
    };
  });

  router.register(gitNexusMcpServer, 'git_nexus.impact_report', async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const changedPaths = readChangedPaths(input.args, input.task);
    const graph = await indexer.indexDependencyGraph(repoRoot);
    const impact = computeImpact({ graph, changedPaths });
    return {
      content: {
        repoRoot,
        changedPaths,
        ...impact,
        edgeCount: graph.edges.length,
        nodeCount: graph.nodes.length,
      },
      metadata: {
        engine: 'recodergit',
        seedCount: impact.seeds.length,
        impactedCount: impact.impactedFiles.length,
      },
    };
  });

  router.register(gitNexusMcpServer, 'git_nexus.search_code', async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const query = readRequiredString(input.args.query, 'query');
    const limit = readNumber(input.args.limit) ?? 50;
    const matches = await searchCode(repoRoot, query, limit);
    return {
      content: { repoRoot, query, matches },
      metadata: { engine: 'recodergit', matchCount: matches.length },
    };
  });

  router.register(gitNexusMcpServer, 'git_nexus.get_package_map', async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const graph = await indexer.indexDependencyGraph(repoRoot);
    const packages = packageMapFromGraph(graph);
    return {
      content: { repoRoot, packages, indexedAt: graph.indexedAt },
      metadata: { engine: 'recodergit', packageCount: packages.length },
    };
  });

  router.register(gitNexusMcpServer, 'git_nexus.get_owners', async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const paths = readChangedPaths(input.args, input.task);
    const scan = await scanRepo(repoRoot);
    const { buildOwnershipMap } = await import('@recoder/recodergit');
    const ownershipMap = await buildOwnershipMap(repoRoot, scan.files);
    const owners = paths.map((path) => ({ path, owners: ownersForPath(ownershipMap, path) }));
    return {
      content: { repoRoot, owners, entries: ownershipMap.entries },
      metadata: { engine: 'recodergit', pathCount: paths.length },
    };
  });

  router.register(gitNexusMcpServer, 'git_nexus.get_related_tests', async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const task = buildTaskSpec(input);
    const pack = await indexer.contextPack({ task, repoRoot });
    const relatedTests = relatedTestsForPaths(pack.testTargetMap, task.targetPaths);
    return {
      content: { repoRoot, targetPaths: task.targetPaths, relatedTests },
      metadata: { engine: 'recodergit', testCount: relatedTests.length },
    };
  });
}

async function resolveRoot(port: GitNexusPort, input: { task?: TaskSpec; args: Record<string, unknown> }): Promise<string> {
  const repo = readString(input.args.repo) ?? input.task?.repo;
  const spaceId = readString(input.args.spaceId) ?? input.task?.spaceId;
  const root = await port.resolveRepoRoot({ repo, spaceId });
  if (!root || !root.trim()) {
    throw new Error('git_nexus: repository root could not be resolved (repo unconfigured).');
  }
  return root;
}

function contextPackMetadata(pack: ContextPack): Record<string, unknown> {
  return {
    engine: 'recodergit',
    nodeCount: pack.dependencyGraph.nodes.length,
    edgeCount: pack.dependencyGraph.edges.length,
    impactedPackages: pack.impactReport.impactedPackages.length,
  };
}

function packageMapFromGraph(graph: DependencyGraph): Array<{ package: string; fileCount: number }> {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) {
    const pkg = node.split('/').slice(0, 2).join('/');
    if (!pkg) continue;
    counts.set(pkg, (counts.get(pkg) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([pkg, fileCount]) => ({ package: pkg, fileCount }))
    .sort((a, b) => a.package.localeCompare(b.package));
}

/**
 * Real source search over the indexed files. Greps the scanned repo files for a
 * literal query, returning file + line + snippet for each hit (capped at limit).
 */
async function searchCode(
  repoRoot: string,
  query: string,
  limit: number,
): Promise<Array<{ path: string; line: number; snippet: string }>> {
  const { promises: fs } = await import('node:fs');
  const nodePath = await import('node:path');
  const scan = await scanRepo(repoRoot);
  const needle = query.toLowerCase();
  const matches: Array<{ path: string; line: number; snippet: string }> = [];

  for (const relative of scan.files) {
    if (matches.length >= limit) break;
    let source: string;
    try {
      source = await fs.readFile(nodePath.join(repoRoot, relative), 'utf8');
    } catch {
      continue;
    }
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= limit) break;
      const line = lines[i] ?? '';
      if (line.toLowerCase().includes(needle)) {
        matches.push({ path: relative, line: i + 1, snippet: line.trim().slice(0, 240) });
      }
    }
  }
  return matches;
}

/**
 * Build a TaskSpec the indexer can consume from the call input. Prefers the
 * real task on the call; otherwise synthesizes a minimal spec from args so
 * ad-hoc context-pack requests still produce a real pack.
 */
function buildTaskSpec(input: { task?: TaskSpec; args: Record<string, unknown> }): TaskSpec {
  if (input.task) {
    const overridePaths = readStringArray(input.args.targetPaths ?? input.args.paths);
    if (overridePaths.length > 0) {
      return { ...input.task, targetPaths: overridePaths };
    }
    return input.task;
  }

  const targetPaths = readStringArray(input.args.targetPaths ?? input.args.paths);
  return {
    taskId: readString(input.args.taskId) ?? `gitnexus_${Date.now()}`,
    title: readString(input.args.title) ?? 'Git Nexus context pack',
    intent: 'research',
    goal: readString(input.args.goal) ?? 'Assemble repository context.',
    spaceId: readString(input.args.spaceId) ?? 'default',
    targetPaths,
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
}

function readChangedPaths(args: Record<string, unknown>, task?: TaskSpec): string[] {
  const explicit = readStringArray(args.changedPaths ?? args.targetPaths ?? args.paths);
  if (explicit.length > 0) {
    return explicit;
  }
  return task?.targetPaths ?? [];
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function readRequiredString(value: unknown, field: string): string {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export type { ContextPack, ImpactResult };
