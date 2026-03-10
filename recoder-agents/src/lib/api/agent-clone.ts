import { backendApi } from '../api-client';

// ============================================================================
// Types
// ============================================================================

export interface CloneAgentRequest {
  name?: string;
  instructions_override?: string;
  model_override?: string;
  tool_overrides?: Record<string, any>;
}

export interface CloneAgentResponse {
  agent_id: string;
  name: string;
  source_agent_id: string;
  modifications: Record<string, any>;
  created_at: string;
}

export interface CloneHistoryItem {
  id: string;
  source_agent_id: string;
  cloned_agent_id: string;
  cloned_agent_name: string | null;
  modifications: Record<string, any>;
  created_at: string;
}

export interface CloneHistoryResponse {
  clones: CloneHistoryItem[];
  total: number;
}

export interface AgentDiffField {
  field: string;
  type: 'same' | 'modified' | 'added' | 'removed';
  value_a: any;
  value_b: any;
}

export interface AgentDiffResponse {
  agent_a_id: string;
  agent_a_name: string;
  agent_b_id: string;
  agent_b_name: string;
  differences: AgentDiffField[];
}

// ============================================================================
// API Functions
// ============================================================================

export const cloneAgentWithMods = async (
  agentId: string,
  request: CloneAgentRequest = {}
): Promise<CloneAgentResponse> => {
  const response = await backendApi.post<CloneAgentResponse>(
    `/agents/${agentId}/clone-with-mods`,
    request,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to clone agent: ${response.error.message}`);
  }

  return response.data!;
};

export const getAgentClones = async (
  agentId: string,
  limit = 50,
  offset = 0
): Promise<CloneHistoryResponse> => {
  const response = await backendApi.get<CloneHistoryResponse>(
    `/agents/${agentId}/clones?limit=${limit}&offset=${offset}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch agent clones: ${response.error.message}`);
  }

  return response.data!;
};

export const getAgentDiff = async (
  agentA: string,
  agentB: string
): Promise<AgentDiffResponse> => {
  const response = await backendApi.get<AgentDiffResponse>(
    `/agents/clone-diff?agent_a=${agentA}&agent_b=${agentB}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to diff agents: ${response.error.message}`);
  }

  return response.data!;
};
