import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getKnowledgeGraph,
  addNode,
  addEdge,
  getNodeConnections,
  removeNode,
  removeEdge,
  autoDiscover,
  getGraphStats,
  type CreateNodeData,
  type CreateEdgeData,
} from '@/lib/api/knowledge-graph';

const kgKeys = {
  all: ['knowledge-graph'] as const,
  graph: (nodeType?: string) => [...kgKeys.all, 'graph', nodeType ?? 'all'] as const,
  connections: (nodeId: string) => [...kgKeys.all, 'connections', nodeId] as const,
  stats: () => [...kgKeys.all, 'stats'] as const,
};

export function useKnowledgeGraph(nodeType?: string) {
  return useQuery({
    queryKey: kgKeys.graph(nodeType),
    queryFn: () => getKnowledgeGraph(nodeType),
    staleTime: 30_000,
  });
}

export function useAddNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNodeData) => addNode(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kgKeys.all });
    },
  });
}

export function useAddEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEdgeData) => addEdge(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kgKeys.all });
    },
  });
}

export function useNodeConnections(nodeId: string) {
  return useQuery({
    queryKey: kgKeys.connections(nodeId),
    queryFn: () => getNodeConnections(nodeId),
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}

export function useRemoveNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: string) => removeNode(nodeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kgKeys.all });
    },
  });
}

export function useRemoveEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (edgeId: string) => removeEdge(edgeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kgKeys.all });
    },
  });
}

export function useAutoDiscover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => autoDiscover(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kgKeys.all });
    },
  });
}

export function useGraphStats() {
  return useQuery({
    queryKey: kgKeys.stats(),
    queryFn: getGraphStats,
    staleTime: 60_000,
  });
}
