import type {
  DependencyEdge,
  DependencyGraph,
  ExternalImportEdge,
  ProcessNode,
  SymbolCallEdge,
  SymbolNode,
} from './dependency-graph';
import type { PackageEcosystem, RepositoryPackage } from './repository-packages';

export const DEPENDENCY_GRAPH_SNAPSHOT_VERSION = 5 as const;
/** Increment when dependency discovery or resolution semantics change. */
export const DEPENDENCY_GRAPH_ANALYZER_VERSION = 6 as const;

type EncodedEdge = [fromNode: number, toNode: number, kind: DependencyEdge['kind'], weight?: number];
type EncodedSymbol = [fileNode: number, name: string, kind: SymbolNode['kind']];
type EncodedSymbolCall = [fromNode: number, toNode: number, caller: string, callee: string];
type EncodedProcess = [
  id: string,
  label: string,
  processType: ProcessNode['processType'],
  fileNode: number,
  symbol?: string,
];
type EncodedCoChange = [
  leftNode: number,
  rightNode: number,
  commits: number,
  confidence: number,
];
type EncodedExternalImport = [fromNode: number, ecosystem: PackageEcosystem, specifier: string];
type EncodedPackage = [ecosystem: PackageEcosystem, name: string, root: string, importNames: string[]];

/** Compact, versioned representation suitable for an installed-app JSON store. */
export type DependencyGraphSnapshot = {
  version: typeof DEPENDENCY_GRAPH_SNAPSHOT_VERSION;
  analyzerVersion: typeof DEPENDENCY_GRAPH_ANALYZER_VERSION;
  repoRoot: string;
  revision: string;
  indexedAt: string;
  nodes: string[];
  edges: EncodedEdge[];
  symbols: EncodedSymbol[];
  symbolCalls: EncodedSymbolCall[];
  processes: EncodedProcess[];
  coChanges: EncodedCoChange[];
  externalImports: EncodedExternalImport[];
  packages: EncodedPackage[];
  index: {
    indexedFiles: number;
    maxFiles: number;
    truncated: boolean;
  };
};

const EDGE_KINDS = new Set<DependencyEdge['kind']>([
  'imports',
  'depends_on',
  'tests',
  'owns',
  'custom',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Encode paths once and store graph edges as node indexes. */
export function createDependencyGraphSnapshot(
  graph: DependencyGraph,
  revision: string,
): DependencyGraphSnapshot {
  if (!revision.trim()) throw new Error('dependency graph snapshot requires a revision');
  const nodes = [...graph.nodes];
  const nodeIndex = new Map(nodes.map((node, index) => [node, index]));
  const edges = graph.edges.map((edge): EncodedEdge => {
    const from = nodeIndex.get(edge.from);
    const to = nodeIndex.get(edge.to);
    if (from === undefined || to === undefined) {
      throw new Error(`dependency graph edge references an unknown node: ${edge.from} -> ${edge.to}`);
    }
    return edge.weight === undefined
      ? [from, to, edge.kind]
      : [from, to, edge.kind, edge.weight];
  });
  const fileNode = (filePath: string): number => {
    const index = nodeIndex.get(filePath);
    if (index === undefined) throw new Error(`dependency graph evidence references an unknown node: ${filePath}`);
    return index;
  };
  const symbols = (graph.symbols ?? []).map((symbol): EncodedSymbol => [
    fileNode(symbol.filePath), symbol.name, symbol.kind,
  ]);
  const symbolCalls = (graph.symbolCalls ?? []).map((call): EncodedSymbolCall => [
    fileNode(call.from), fileNode(call.to), call.caller, call.callee,
  ]);
  const processes = (graph.processes ?? []).map((process): EncodedProcess =>
    process.symbol === undefined
      ? [process.id, process.label, process.processType, fileNode(process.filePath)]
      : [process.id, process.label, process.processType, fileNode(process.filePath), process.symbol]);
  const coChanges = (graph.coChanges ?? []).map((edge): EncodedCoChange => [
    fileNode(edge.left), fileNode(edge.right), edge.commits, edge.confidence,
  ]);
  const externalImports = (graph.externalImports ?? []).map((edge): EncodedExternalImport => [
    fileNode(edge.from), edge.ecosystem, edge.specifier,
  ]);
  const packages = (graph.packages ?? []).map((item): EncodedPackage => [
    item.ecosystem, item.name, item.root, [...item.importNames],
  ]);
  return {
    version: DEPENDENCY_GRAPH_SNAPSHOT_VERSION,
    analyzerVersion: DEPENDENCY_GRAPH_ANALYZER_VERSION,
    repoRoot: graph.repoRoot,
    revision,
    indexedAt: graph.indexedAt,
    nodes,
    edges,
    symbols,
    symbolCalls,
    processes,
    coChanges,
    externalImports,
    packages,
    index: graph.index ?? { indexedFiles: nodes.length, maxFiles: nodes.length, truncated: false },
  };
}

/**
 * Restore only an exact repo/revision match. Corrupt, cross-repo, and stale
 * payloads return null so callers rebuild from source instead of inventing data.
 */
export function restoreDependencyGraphSnapshot(
  value: unknown,
  expected: { repoRoot: string; revision: string },
): DependencyGraph | null {
  const snapshot = record(value);
  if (
    snapshot?.['version'] !== DEPENDENCY_GRAPH_SNAPSHOT_VERSION ||
    snapshot['analyzerVersion'] !== DEPENDENCY_GRAPH_ANALYZER_VERSION ||
    snapshot['repoRoot'] !== expected.repoRoot ||
    snapshot['revision'] !== expected.revision ||
    typeof snapshot['indexedAt'] !== 'string' ||
    !Array.isArray(snapshot['nodes']) ||
    !Array.isArray(snapshot['edges']) ||
    !Array.isArray(snapshot['symbols']) ||
    !Array.isArray(snapshot['symbolCalls']) ||
    !Array.isArray(snapshot['processes']) ||
    !Array.isArray(snapshot['coChanges']) ||
    !Array.isArray(snapshot['externalImports']) ||
    !Array.isArray(snapshot['packages']) ||
    !record(snapshot['index'])
  ) return null;

  const index = record(snapshot['index']);
  if (
    !index ||
    !Number.isInteger(index['indexedFiles']) ||
    (index['indexedFiles'] as number) < 0 ||
    !Number.isInteger(index['maxFiles']) ||
    (index['maxFiles'] as number) < 0 ||
    typeof index['truncated'] !== 'boolean'
  ) return null;

  const nodes = snapshot['nodes'];
  if (!nodes.every((node): node is string => typeof node === 'string') || new Set(nodes).size !== nodes.length) {
    return null;
  }

  const edges: DependencyEdge[] = [];
  for (const encoded of snapshot['edges']) {
    if (!Array.isArray(encoded) || (encoded.length !== 3 && encoded.length !== 4)) return null;
    const [fromIndex, toIndex, kind, weight] = encoded;
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      (fromIndex as number) < 0 ||
      (toIndex as number) < 0 ||
      (fromIndex as number) >= nodes.length ||
      (toIndex as number) >= nodes.length ||
      typeof kind !== 'string' ||
      !EDGE_KINDS.has(kind as DependencyEdge['kind']) ||
      (weight !== undefined && (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0))
    ) return null;
    edges.push({
      from: nodes[fromIndex as number] as string,
      to: nodes[toIndex as number] as string,
      kind: kind as DependencyEdge['kind'],
      ...(weight !== undefined ? { weight } : {}),
    });
  }

  const symbolKinds = new Set<SymbolNode['kind']>(['function', 'method', 'class', 'module']);
  const symbols: SymbolNode[] = [];
  for (const encoded of snapshot['symbols']) {
    if (!Array.isArray(encoded) || encoded.length !== 3) return null;
    const [fileIndex, name, kind] = encoded;
    if (
      !Number.isInteger(fileIndex) ||
      (fileIndex as number) < 0 ||
      (fileIndex as number) >= nodes.length ||
      typeof name !== 'string' ||
      !name ||
      typeof kind !== 'string' ||
      !symbolKinds.has(kind as SymbolNode['kind'])
    ) return null;
    symbols.push({ filePath: nodes[fileIndex as number] as string, name, kind: kind as SymbolNode['kind'] });
  }

  const symbolCalls: SymbolCallEdge[] = [];
  for (const encoded of snapshot['symbolCalls']) {
    if (!Array.isArray(encoded) || encoded.length !== 4) return null;
    const [fromIndex, toIndex, caller, callee] = encoded;
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      (fromIndex as number) < 0 ||
      (toIndex as number) < 0 ||
      (fromIndex as number) >= nodes.length ||
      (toIndex as number) >= nodes.length ||
      typeof caller !== 'string' || !caller ||
      typeof callee !== 'string' || !callee
    ) return null;
    symbolCalls.push({
      from: nodes[fromIndex as number] as string,
      to: nodes[toIndex as number] as string,
      caller,
      callee,
      confidence: 1,
    });
  }

  const processTypes = new Set<ProcessNode['processType']>(['entrypoint', 'server', 'worker', 'route']);
  const processes: ProcessNode[] = [];
  for (const encoded of snapshot['processes']) {
    if (!Array.isArray(encoded) || (encoded.length !== 4 && encoded.length !== 5)) return null;
    const [id, label, processType, fileIndex, symbol] = encoded;
    if (
      typeof id !== 'string' || !id ||
      typeof label !== 'string' || !label ||
      typeof processType !== 'string' ||
      !processTypes.has(processType as ProcessNode['processType']) ||
      !Number.isInteger(fileIndex) ||
      (fileIndex as number) < 0 ||
      (fileIndex as number) >= nodes.length ||
      (symbol !== undefined && (typeof symbol !== 'string' || !symbol))
    ) return null;
    processes.push({
      id,
      label,
      processType: processType as ProcessNode['processType'],
      filePath: nodes[fileIndex as number] as string,
      ...(typeof symbol === 'string' ? { symbol } : {}),
    });
  }

  const coChanges: NonNullable<DependencyGraph['coChanges']> = [];
  for (const encoded of snapshot['coChanges']) {
    if (!Array.isArray(encoded) || encoded.length !== 4) return null;
    const [leftIndex, rightIndex, commits, confidence] = encoded;
    if (
      !Number.isInteger(leftIndex) ||
      !Number.isInteger(rightIndex) ||
      (leftIndex as number) < 0 ||
      (rightIndex as number) < 0 ||
      (leftIndex as number) >= nodes.length ||
      (rightIndex as number) >= nodes.length ||
      leftIndex === rightIndex ||
      typeof commits !== 'number' ||
      !Number.isInteger(commits) ||
      commits <= 0 ||
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) return null;
    coChanges.push({
      left: nodes[leftIndex as number] as string,
      right: nodes[rightIndex as number] as string,
      commits,
      confidence,
    });
  }

  const ecosystems = new Set<PackageEcosystem>(['npm', 'python', 'go', 'cargo']);
  const externalImports: ExternalImportEdge[] = [];
  for (const encoded of snapshot['externalImports']) {
    if (!Array.isArray(encoded) || encoded.length !== 3) return null;
    const [fromIndex, ecosystem, specifier] = encoded;
    if (
      !Number.isInteger(fromIndex) ||
      (fromIndex as number) < 0 ||
      (fromIndex as number) >= nodes.length ||
      typeof ecosystem !== 'string' ||
      !ecosystems.has(ecosystem as PackageEcosystem) ||
      typeof specifier !== 'string' ||
      !specifier
    ) return null;
    externalImports.push({
      from: nodes[fromIndex as number] as string,
      ecosystem: ecosystem as PackageEcosystem,
      specifier,
    });
  }

  const packages: RepositoryPackage[] = [];
  for (const encoded of snapshot['packages']) {
    if (!Array.isArray(encoded) || encoded.length !== 4) return null;
    const [ecosystem, name, root, importNames] = encoded;
    if (
      typeof ecosystem !== 'string' ||
      !ecosystems.has(ecosystem as PackageEcosystem) ||
      typeof name !== 'string' || !name ||
      typeof root !== 'string' ||
      !Array.isArray(importNames) ||
      importNames.length === 0 ||
      !importNames.every((item): item is string => typeof item === 'string' && item.length > 0)
    ) return null;
    packages.push({ ecosystem: ecosystem as PackageEcosystem, name, root, importNames: [...importNames] });
  }

  return {
    repoRoot: expected.repoRoot,
    indexedAt: snapshot['indexedAt'],
    nodes: [...nodes],
    edges,
    symbols,
    symbolCalls,
    processes,
    coChanges,
    externalImports,
    packages,
    index: {
      indexedFiles: index['indexedFiles'] as number,
      maxFiles: index['maxFiles'] as number,
      truncated: index['truncated'] as boolean,
    },
  };
}
