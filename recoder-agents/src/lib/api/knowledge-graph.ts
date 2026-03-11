import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeGraphNode {
  id: string;
  user_id: string;
  node_type: 'agent' | 'thread' | 'tool' | 'knowledge_base' | 'prompt' | 'workflow' | 'tag' | 'data_source';
  node_id: string;
  label: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  user_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: 'uses' | 'produces' | 'depends_on' | 'related_to' | 'contains' | 'triggers' | 'references';
  weight: number;
  created_at: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface NodeConnections {
  node: KnowledgeGraphNode;
  edges: KnowledgeGraphEdge[];
  connected_nodes: KnowledgeGraphNode[];
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  nodes_by_type: Record<string, number>;
  edges_by_type: Record<string, number>;
}

export interface AutoDiscoverResult {
  status: string;
  nodes_discovered: number;
  edges_created: number;
}

export interface CreateNodeData {
  node_type: string;
  node_id: string;
  label: string;
  metadata?: Record<string, any>;
}

export interface CreateEdgeData {
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  weight?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getKnowledgeGraph = async (nodeType?: string): Promise<KnowledgeGraph> => {
  const params = nodeType ? `?node_type=${encodeURIComponent(nodeType)}` : '';
  const response = await backendApi.get<KnowledgeGraph>(`/knowledge-graph${params}`, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const addNode = async (data: CreateNodeData): Promise<KnowledgeGraphNode> => {
  const response = await backendApi.post<KnowledgeGraphNode>('/knowledge-graph/nodes', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const addEdge = async (data: CreateEdgeData): Promise<KnowledgeGraphEdge> => {
  const response = await backendApi.post<KnowledgeGraphEdge>('/knowledge-graph/edges', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getNodeConnections = async (nodeId: string): Promise<NodeConnections> => {
  const response = await backendApi.get<NodeConnections>(
    `/knowledge-graph/node/${nodeId}/connections`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const removeNode = async (nodeId: string) => {
  const response = await backendApi.delete(`/knowledge-graph/nodes/${nodeId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const removeEdge = async (edgeId: string) => {
  const response = await backendApi.delete(`/knowledge-graph/edges/${edgeId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const autoDiscover = async (): Promise<AutoDiscoverResult> => {
  const response = await backendApi.post<AutoDiscoverResult>('/knowledge-graph/auto-discover');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getGraphStats = async (): Promise<GraphStats> => {
  const response = await backendApi.get<GraphStats>('/knowledge-graph/stats', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
