import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
  agent_count?: number;
}

export interface TagAssignment {
  agent_id: string;
  assigned_at: string;
}

export interface CreateTagData {
  name: string;
  color?: string;
  description?: string;
}

export interface UpdateTagData {
  name?: string;
  color?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Tag CRUD
// ---------------------------------------------------------------------------

export const createAgentTag = async (data: CreateTagData): Promise<AgentTag> => {
  const response = await backendApi.post<AgentTag>('/agent-tags', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAgentTags = async (): Promise<AgentTag[]> => {
  const response = await backendApi.get<AgentTag[]>('/agent-tags', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateAgentTag = async (
  tagId: string,
  data: UpdateTagData
): Promise<AgentTag> => {
  const response = await backendApi.patch<AgentTag>(`/agent-tags/${tagId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteAgentTag = async (tagId: string) => {
  const response = await backendApi.delete(`/agent-tags/${tagId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

// ---------------------------------------------------------------------------
// Tag assignments
// ---------------------------------------------------------------------------

export const assignAgentTag = async (
  agentId: string,
  tagId: string
) => {
  const response = await backendApi.post(`/agents/${agentId}/tags`, {
    tag_id: tagId,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const removeAgentTag = async (agentId: string, tagId: string) => {
  const response = await backendApi.delete(
    `/agents/${agentId}/tags/${tagId}`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const getAgentTagsForAgent = async (
  agentId: string
): Promise<AgentTag[]> => {
  const response = await backendApi.get<AgentTag[]>(
    `/agents/${agentId}/tags`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTagAgents = async (
  tagId: string
): Promise<TagAssignment[]> => {
  const response = await backendApi.get<TagAssignment[]>(
    `/agent-tags/${tagId}/agents`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
