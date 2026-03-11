import { backendApi } from '../api-client';

// ============================================================================
// Types
// ============================================================================

export interface DependencyRecord {
  id: string;
  agent_id: string;
  depends_on_agent_id: string;
  dependency_type: 'calls' | 'triggers' | 'shares_data' | 'requires' | 'extends';
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AddDependencyRequest {
  depends_on_agent_id: string;
  dependency_type?: string;
  description?: string;
}

export interface GraphNode {
  id: string;
  name: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ImpactNode {
  agent_id: string;
  name: string;
  depth: number;
  dependency_type: string;
}

export interface ImpactAnalysis {
  agent_id: string;
  affected_agents: ImpactNode[];
  total_affected: number;
}

export interface TopDependedAgent {
  agent_id: string;
  name: string;
  dependent_count: number;
}

export interface OrphanAgent {
  agent_id: string;
  name: string;
}

export interface CircularChain {
  cycle: string[];
}

export interface DependencyStats {
  most_depended_on: TopDependedAgent[];
  orphan_agents: OrphanAgent[];
  circular_dependencies: CircularChain[];
}

// ============================================================================
// API Functions
// ============================================================================

export async function addAgentDependency(
  agentId: string,
  data: AddDependencyRequest
): Promise<DependencyRecord> {
  const response = await backendApi.post<DependencyRecord>(
    `/agents/${agentId}/dependencies`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to add dependency: ${response.error.message}`);
  }

  return response.data!;
}

export async function getAgentDependenciesV2(
  agentId: string
): Promise<DependencyRecord[]> {
  const response = await backendApi.get<DependencyRecord[]>(
    `/agents/${agentId}/dependencies`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch dependencies: ${response.error.message}`);
  }

  return response.data!;
}

export async function removeAgentDependency(
  agentId: string,
  depId: string
): Promise<{ deleted: boolean; id: string }> {
  const response = await backendApi.delete<{ deleted: boolean; id: string }>(
    `/agents/${agentId}/dependencies/${depId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to remove dependency: ${response.error.message}`);
  }

  return response.data!;
}

export async function getFullDependencyGraph(): Promise<DependencyGraph> {
  const response = await backendApi.get<DependencyGraph>(
    '/agents/dependency-graph',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch dependency graph: ${response.error.message}`);
  }

  return response.data!;
}

export async function getAgentImpact(
  agentId: string
): Promise<ImpactAnalysis> {
  const response = await backendApi.get<ImpactAnalysis>(
    `/agents/${agentId}/impact`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch impact analysis: ${response.error.message}`);
  }

  return response.data!;
}

export async function getDependencyStats(): Promise<DependencyStats> {
  const response = await backendApi.get<DependencyStats>(
    '/agents/dependency-stats',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch dependency stats: ${response.error.message}`);
  }

  return response.data!;
}
