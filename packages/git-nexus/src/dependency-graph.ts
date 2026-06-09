export type DependencyEdge = {
  from: string;
  to: string;
  kind: 'imports' | 'depends_on' | 'tests' | 'owns' | 'custom';
  weight?: number;
};

export type DependencyGraph = {
  repoRoot: string;
  nodes: string[];
  edges: DependencyEdge[];
  indexedAt: string;
};

export function createEmptyDependencyGraph(repoRoot: string, indexedAt = new Date().toISOString()): DependencyGraph {
  return {
    repoRoot,
    nodes: [],
    edges: [],
    indexedAt,
  };
}
