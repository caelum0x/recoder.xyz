import { backendApi } from '@/lib/api-client';

export interface AgentFavorite {
  id: string;
  user_id: string;
  agent_id: string;
  display_order: number;
  quick_prompt: string | null;
  created_at: string;
}

export const getAgentFavorites = async (): Promise<AgentFavorite[]> => {
  const response = await backendApi.get<AgentFavorite[]>(
    '/agents/favorites',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const addAgentFavorite = async (
  agentId: string,
  quickPrompt?: string
): Promise<AgentFavorite> => {
  const response = await backendApi.post<AgentFavorite>('/agents/favorites', {
    agent_id: agentId,
    quick_prompt: quickPrompt || null,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const removeAgentFavorite = async (agentId: string): Promise<void> => {
  const response = await backendApi.delete(`/agents/favorites/${agentId}`);
  if (response.error) throw new Error(response.error.message);
};

export const reorderAgentFavorites = async (
  agentIds: string[]
): Promise<void> => {
  const response = await backendApi.put('/agents/favorites/reorder', {
    agent_ids: agentIds,
  });
  if (response.error) throw new Error(response.error.message);
};

export const updateFavoritePrompt = async (
  agentId: string,
  quickPrompt: string | null
): Promise<AgentFavorite> => {
  const response = await backendApi.patch<AgentFavorite>(
    `/agents/favorites/${agentId}`,
    { quick_prompt: quickPrompt }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
