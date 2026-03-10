import { backendApi } from '../api-client';

// ============================================================================
// Types
// ============================================================================

export interface AgentDependency {
  id: string;
  user_id: string;
  source_agent_id: string;
  target_agent_id: string;
  dependency_type: 'calls' | 'chains_to' | 'shares_kb' | 'shares_tools' | 'cloned_from';
  description: string | null;
  is_auto_detected: boolean;
  created_at: string;
}

export interface CreateDependencyRequest {
  source_agent_id: string;
  target_agent_id: string;
  dependency_type?: string;
  description?: string;
}

export interface GraphNode {
  agent_id: string;
  name: string;
  health_score: number | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  dependency_type: string;
  description: string | null;
  is_auto_detected: boolean;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AutoDetectResult {
  detected: number;
  dependencies: AgentDependency[];
}

// ============================================================================
// API Functions
// ============================================================================

export const getAgentDependencies = async (
  agentId?: string
): Promise<AgentDependency[]> => {
  const query = agentId ? `?agent_id=${agentId}` : '';
  const response = await backendApi.get<AgentDependency[]>(
    `/agents/dependencies${query}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch dependencies: ${response.error.message}`);
  }

  return response.data!;
};

export const createAgentDependency = async (
  data: CreateDependencyRequest
): Promise<AgentDependency> => {
  const response = await backendApi.post<AgentDependency>(
    '/agents/dependencies',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create dependency: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteAgentDependency = async (
  depId: string
): Promise<{ deleted: boolean; id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; id: string }>(
    `/agents/dependencies/${depId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete dependency: ${response.error.message}`);
  }

  return response.data!;
};

export const getAgentDependencyGraph = async (): Promise<DependencyGraph> => {
  const response = await backendApi.get<DependencyGraph>(
    '/agents/dependency-graph',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch dependency graph: ${response.error.message}`);
  }

  return response.data!;
};

export const autoDetectDependencies = async (): Promise<AutoDetectResult> => {
  const response = await backendApi.post<AutoDetectResult>(
    '/agents/dependencies/auto-detect',
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to auto-detect dependencies: ${response.error.message}`);
  }

  return response.data!;
};
