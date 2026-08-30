import path from 'node:path';
import type {
  DependencyEdge,
  DependencyGraph,
  ProcessNode,
  SymbolCallEdge,
} from './dependency-graph';
import type { CrossRepositoryConsumer } from './repository-network';

export type FileImpactDirection = 'upstream' | 'downstream';
export type FileImpactRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ImpactProcess = {
  id: string;
  label: string;
  processType: ProcessNode['processType'];
  filePath: string;
};

export type FileImpactItem = {
  depth: number;
  id: string;
  name: string;
  type: 'File' | 'Symbol';
  filePath: string;
  relationType: 'IMPORTED_BY' | 'IMPORTS' | 'CALLED_BY' | 'CALLS';
  confidence: 1;
  processes: ImpactProcess[];
};

export type FileCoChange = {
  filePath: string;
  name: string;
  relationType: 'CO_CHANGED_WITH';
  commits: number;
  confidence: number;
  processes: ImpactProcess[];
};

export type FileImpactResult = {
  engine: 'permissive-mit';
  scope: 'file-import-graph' | 'symbol-call-graph';
  target: { id: string; name: string; type: 'File' | 'Symbol'; filePath: string };
  direction: FileImpactDirection;
  impactedCount: number;
  risk: FileImpactRisk;
  partial: boolean;
  summary: {
    direct: number;
    co_changed: number;
    cross_repository_files: number;
    consumer_repositories: number;
    processes_affected: number;
    modules_affected: number;
  };
  byDepthCounts: Record<number, number>;
  affected_processes: ImpactProcess[];
  affected_modules: Array<{ name: string; hits: number; impact: 'direct' | 'indirect' }>;
  /** Directionless, commit-backed companions for the target file. */
  coChanges: FileCoChange[];
  /** Consumer files in other registered repositories, populated by the installed registry. */
  crossRepository: CrossRepositoryConsumer[];
  pagination?: { limit: number; offset: 0; truncated: true };
  byDepth: Record<number, FileImpactItem[]>;
};

export type FileImpactQuery = {
  graph: DependencyGraph;
  targetPath: string;
  /** Prefer definition-backed symbol calls when this symbol exists in targetPath. */
  symbol?: string;
  direction: FileImpactDirection;
  maxDepth?: number;
  limit?: number;
  includeTests?: boolean;
  /** Bounds traversal memory for hostile or generated graphs. */
  maxVisited?: number;
};

const TEST_MARKERS = [
  '.test.', '.spec.', '/__tests__/', '/__mocks__/', '/test/', '/tests/',
  '/testing/', '/fixtures/', '/spec/', '/test_', '/conftest.',
] as const;

export function isTestFile(pathValue: string): boolean {
  const normalized = `/${pathValue.toLowerCase().replace(/\\/g, '/')}`;
  return TEST_MARKERS.some((marker) => normalized.includes(marker)) ||
    normalized.endsWith('_test.go') ||
    normalized.endsWith('_test.py') ||
    normalized.endsWith('_spec.rb') ||
    normalized.endsWith('_test.rb');
}

/**
 * Traverse definition-backed symbol calls when the target declaration exists.
 * Fall back to static file imports for unsupported syntax or unresolved symbols.
 * Both paths return the bounded envelope consumed by installed PR review.
 */
export function computeFileImpact(query: FileImpactQuery): FileImpactResult | null {
  const targetPath = normalizeGraphPath(query.targetPath);
  if (!targetPath || !query.graph.nodes.includes(targetPath)) return null;
  const symbol = query.symbol?.trim();
  if (symbol && (query.graph.symbols ?? []).some((item) =>
    item.filePath === targetPath && item.name === symbol)) {
    return computeSymbolImpact({ ...query, targetPath, symbol });
  }
  const maxDepth = positiveInt(query.maxDepth, 3);
  const limit = positiveInt(query.limit, 20);
  const maxVisited = positiveInt(query.maxVisited, 5_000);
  const adjacency = buildAdjacency(query.graph.edges, query.direction);
  const membership = processMembership(query.graph);
  const coChanges = coChangeEvidence(query.graph, targetPath, membership, query.includeTests, limit);
  const visited = new Set<string>([targetPath]);
  let frontier = [targetPath];
  let traversalPartial = false;
  const fullByDepth: Record<number, FileImpactItem[]> = {};

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    const items: FileImpactItem[] = [];
    for (const current of frontier) {
      const reached = [...(adjacency.get(current) ?? [])].sort();
      for (const filePath of reached) {
        if (visited.has(filePath)) continue;
        if (!query.includeTests && isTestFile(filePath)) continue;
        if (visited.size >= maxVisited) {
          traversalPartial = true;
          continue;
        }
        visited.add(filePath);
        next.push(filePath);
        items.push({
          depth,
          id: filePath,
          name: path.posix.basename(filePath),
          type: 'File',
          filePath,
          relationType: query.direction === 'upstream' ? 'IMPORTED_BY' : 'IMPORTS',
          confidence: 1,
          processes: membership.get(filePath) ?? [],
        });
      }
    }
    if (items.length > 0) fullByDepth[depth] = items;
    frontier = [...new Set(next)].sort();
  }

  const byDepth: Record<number, FileImpactItem[]> = {};
  const byDepthCounts: Record<number, number> = {};
  let paginationTruncated = false;
  const allItems: FileImpactItem[] = [];
  for (const [depthValue, items] of Object.entries(fullByDepth)) {
    const depth = Number(depthValue);
    byDepthCounts[depth] = items.length;
    byDepth[depth] = items.slice(0, limit);
    allItems.push(...items);
    if (items.length > limit) paginationTruncated = true;
  }

  const direct = fullByDepth[1]?.length ?? 0;
  const modules = moduleImpact(allItems);
  const affectedProcesses = collectProcesses([
    ...(membership.get(targetPath) ?? []),
    ...allItems.flatMap((item) => item.processes),
    ...coChanges.items.flatMap((item) => item.processes),
  ]);
  return {
    engine: 'permissive-mit',
    scope: 'file-import-graph',
    target: { id: targetPath, name: path.posix.basename(targetPath), type: 'File', filePath: targetPath },
    direction: query.direction,
    impactedCount: combinedImpactCount(allItems, coChanges.items),
    risk: riskForImpact(direct + coChanges.items.length, allItems.length + coChanges.items.length),
    partial: traversalPartial || coChanges.truncated || query.graph.index?.truncated === true,
    summary: {
      direct,
      co_changed: coChanges.total,
      cross_repository_files: 0,
      consumer_repositories: 0,
      processes_affected: affectedProcesses.length,
      modules_affected: modules.length,
    },
    byDepthCounts,
    affected_processes: affectedProcesses,
    affected_modules: modules,
    coChanges: coChanges.items,
    crossRepository: [],
    ...(paginationTruncated ? { pagination: { limit, offset: 0, truncated: true } } : {}),
    byDepth,
  };
}

function computeSymbolImpact(
  query: FileImpactQuery & { targetPath: string; symbol: string },
): FileImpactResult {
  const maxDepth = positiveInt(query.maxDepth, 3);
  const limit = positiveInt(query.limit, 20);
  const maxVisited = positiveInt(query.maxVisited, 5_000);
  const membership = processMembership(query.graph);
  const coChanges = coChangeEvidence(
    query.graph,
    query.targetPath,
    membership,
    query.includeTests,
    limit,
  );
  const calls = query.graph.symbolCalls ?? [];
  const visited = new Set<string>([symbolKey(query.targetPath, query.symbol)]);
  let frontier = [{ filePath: query.targetPath, symbol: query.symbol }];
  let traversalPartial = false;
  const fullByDepth: Record<number, FileImpactItem[]> = {};

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: Array<{ filePath: string; symbol: string }> = [];
    const items: FileImpactItem[] = [];
    for (const current of frontier) {
      const reached = symbolNeighbors(calls, current.filePath, current.symbol, query.direction);
      for (const item of reached) {
        const key = symbolKey(item.filePath, item.symbol);
        if (visited.has(key)) continue;
        if (!query.includeTests && isTestFile(item.filePath)) continue;
        if (visited.size >= maxVisited) {
          traversalPartial = true;
          continue;
        }
        visited.add(key);
        next.push(item);
        items.push({
          depth,
          id: key,
          name: item.symbol,
          type: 'Symbol',
          filePath: item.filePath,
          relationType: query.direction === 'upstream' ? 'CALLED_BY' : 'CALLS',
          confidence: 1,
          processes: membership.get(item.filePath) ?? [],
        });
      }
    }
    if (items.length > 0) fullByDepth[depth] = items;
    frontier = next;
  }

  const byDepth: Record<number, FileImpactItem[]> = {};
  const byDepthCounts: Record<number, number> = {};
  const allItems: FileImpactItem[] = [];
  let paginationTruncated = false;
  for (const [depthValue, items] of Object.entries(fullByDepth)) {
    const depth = Number(depthValue);
    byDepthCounts[depth] = items.length;
    byDepth[depth] = items.slice(0, limit);
    allItems.push(...items);
    if (items.length > limit) paginationTruncated = true;
  }
  const direct = fullByDepth[1]?.length ?? 0;
  const modules = moduleImpact(allItems);
  const affectedProcesses = collectProcesses([
    ...(membership.get(query.targetPath) ?? []),
    ...allItems.flatMap((item) => item.processes),
    ...coChanges.items.flatMap((item) => item.processes),
  ]);
  return {
    engine: 'permissive-mit',
    scope: 'symbol-call-graph',
    target: {
      id: symbolKey(query.targetPath, query.symbol),
      name: query.symbol,
      type: 'Symbol',
      filePath: query.targetPath,
    },
    direction: query.direction,
    impactedCount: combinedImpactCount(allItems, coChanges.items),
    risk: riskForImpact(direct + coChanges.items.length, allItems.length + coChanges.items.length),
    partial: traversalPartial || coChanges.truncated || query.graph.index?.truncated === true,
    summary: {
      direct,
      co_changed: coChanges.total,
      cross_repository_files: 0,
      consumer_repositories: 0,
      processes_affected: affectedProcesses.length,
      modules_affected: modules.length,
    },
    byDepthCounts,
    affected_processes: affectedProcesses,
    affected_modules: modules,
    coChanges: coChanges.items,
    crossRepository: [],
    ...(paginationTruncated ? { pagination: { limit, offset: 0, truncated: true } } : {}),
    byDepth,
  };
}

function coChangeEvidence(
  graph: DependencyGraph,
  targetPath: string,
  membership: Map<string, ImpactProcess[]>,
  includeTests: boolean | undefined,
  limit: number,
): { items: FileCoChange[]; total: number; truncated: boolean } {
  const found = new Map<string, FileCoChange>();
  for (const edge of graph.coChanges ?? []) {
    const filePath = edge.left === targetPath
      ? edge.right
      : edge.right === targetPath
        ? edge.left
        : null;
    if (!filePath || (!includeTests && isTestFile(filePath))) continue;
    const item: FileCoChange = {
      filePath,
      name: path.posix.basename(filePath),
      relationType: 'CO_CHANGED_WITH',
      commits: edge.commits,
      confidence: edge.confidence,
      processes: membership.get(filePath) ?? [],
    };
    const prior = found.get(filePath);
    if (!prior || item.commits > prior.commits || item.confidence > prior.confidence) {
      found.set(filePath, item);
    }
  }
  const all = [...found.values()].sort((a, b) =>
    b.confidence - a.confidence || b.commits - a.commits || a.filePath.localeCompare(b.filePath));
  return { items: all.slice(0, limit), total: all.length, truncated: all.length > limit };
}

function combinedImpactCount(
  graphItems: readonly FileImpactItem[],
  coChanges: readonly FileCoChange[],
): number {
  const graphFiles = new Set(graphItems.map((item) => item.filePath));
  return graphItems.length + coChanges.filter((item) => !graphFiles.has(item.filePath)).length;
}

function symbolKey(filePath: string, symbol: string): string {
  return `${filePath}#${symbol}`;
}

function symbolNeighbors(
  calls: readonly SymbolCallEdge[],
  filePath: string,
  symbol: string,
  direction: FileImpactDirection,
): Array<{ filePath: string; symbol: string }> {
  const found = new Map<string, { filePath: string; symbol: string }>();
  for (const call of calls) {
    const matches = direction === 'upstream'
      ? call.to === filePath && call.callee === symbol
      : call.from === filePath && call.caller === symbol;
    if (!matches) continue;
    const reached = direction === 'upstream'
      ? { filePath: call.from, symbol: call.caller }
      : { filePath: call.to, symbol: call.callee };
    found.set(symbolKey(reached.filePath, reached.symbol), reached);
  }
  return [...found.values()].sort((a, b) =>
    a.filePath === b.filePath ? a.symbol.localeCompare(b.symbol) : a.filePath.localeCompare(b.filePath));
}

function processMembership(graph: DependencyGraph): Map<string, ImpactProcess[]> {
  const membership = new Map<string, ImpactProcess[]>();
  const adjacency = buildAdjacency(graph.edges, 'downstream');
  for (const process of (graph.processes ?? []).slice(0, 100)) {
    const view: ImpactProcess = {
      id: process.id,
      label: process.label,
      processType: process.processType,
      filePath: process.filePath,
    };
    const visited = new Set<string>([process.filePath]);
    const queue = [process.filePath];
    while (queue.length > 0 && visited.size <= 5_000) {
      const current = queue.shift();
      if (!current) break;
      membership.set(current, collectProcesses([...(membership.get(current) ?? []), view]));
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return membership;
}

function collectProcesses(processes: readonly ImpactProcess[]): ImpactProcess[] {
  return [...new Map(processes.map((process) => [process.id, process])).values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 30);
}

function buildAdjacency(
  edges: readonly DependencyEdge[],
  direction: FileImpactDirection,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.kind !== 'imports' && edge.kind !== 'depends_on') continue;
    const from = direction === 'upstream' ? edge.to : edge.from;
    const to = direction === 'upstream' ? edge.from : edge.to;
    const reached = adjacency.get(from) ?? new Set<string>();
    reached.add(to);
    adjacency.set(from, reached);
  }
  return adjacency;
}

function moduleImpact(items: readonly FileImpactItem[]): FileImpactResult['affected_modules'] {
  const hits = new Map<string, number>();
  const direct = new Set(items.filter((item) => item.depth === 1).map((item) => moduleName(item.filePath)));
  for (const item of items) {
    const name = moduleName(item.filePath);
    hits.set(name, (hits.get(name) ?? 0) + 1);
  }
  return [...hits.entries()]
    .map(([name, count]) => ({ name, hits: count, impact: direct.has(name) ? 'direct' as const : 'indirect' as const }))
    .sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name))
    .slice(0, 20);
}

function moduleName(filePath: string): string {
  const parts = filePath.split('/');
  return parts.slice(0, Math.min(2, parts.length)).join('/');
}

function riskForImpact(direct: number, total: number): FileImpactRisk {
  if (direct >= 30 || total >= 200) return 'CRITICAL';
  if (direct >= 15 || total >= 100) return 'HIGH';
  if (direct >= 5 || total >= 30) return 'MEDIUM';
  return 'LOW';
}

function normalizeGraphPath(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return null;
  if (normalized.split('/').some((part) => part === '..' || part === '')) return null;
  return normalized;
}

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}
