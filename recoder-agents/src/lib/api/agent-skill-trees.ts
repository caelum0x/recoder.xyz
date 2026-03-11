import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillTreeNode {
  id: string;
  user_id: string;
  agent_id: string;
  skill_name: string;
  skill_description: string | null;
  skill_category: string;
  parent_skill_id: string | null;
  level_required: number;
  xp_cost: number;
  icon: string;
  is_unlocked: boolean;
  unlocked_at: string | null;
  created_at: string;
}

export interface SkillXPEvent {
  id: string;
  user_id: string;
  agent_id: string;
  xp_amount: number;
  event_type: string;
  description: string | null;
  created_at: string;
}

export interface SkillProgress {
  id?: string;
  user_id?: string;
  agent_id: string;
  total_xp: number;
  current_level: number;
  skills_unlocked: number;
  xp_to_next_level: number;
  updated_at?: string;
}

export interface UnlockSkillResult {
  skill: SkillTreeNode;
  xp_spent: number;
  new_total_xp: number;
  new_level: number;
}

export interface CreateSkillNodeData {
  skill_name: string;
  skill_description?: string;
  skill_category?: string;
  parent_skill_id?: string;
  level_required?: number;
  xp_cost?: number;
  icon?: string;
}

export interface AwardXPData {
  xp_amount: number;
  event_type: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const createSkillNode = async (
  agentId: string,
  data: CreateSkillNodeData
): Promise<SkillTreeNode> => {
  const response = await backendApi.post<SkillTreeNode>(`/agents/${agentId}/skills`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getSkillTreeNodes = async (agentId: string): Promise<SkillTreeNode[]> => {
  const response = await backendApi.get<SkillTreeNode[]>(`/agents/${agentId}/skills`, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const unlockSkill = async (
  agentId: string,
  skillId: string
): Promise<UnlockSkillResult> => {
  const response = await backendApi.post<UnlockSkillResult>(
    `/agents/${agentId}/skills/${skillId}/unlock`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteSkillNode = async (agentId: string, skillId: string): Promise<void> => {
  const response = await backendApi.delete(`/agents/${agentId}/skills/${skillId}`);
  if (response.error) throw new Error(response.error.message);
};

export const awardXP = async (agentId: string, data: AwardXPData): Promise<SkillProgress> => {
  const response = await backendApi.post<SkillProgress>(`/agents/${agentId}/xp`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getXPEvents = async (
  agentId: string,
  limit?: number
): Promise<SkillXPEvent[]> => {
  const params = limit != null ? `?limit=${limit}` : '';
  const response = await backendApi.get<SkillXPEvent[]>(`/agents/${agentId}/xp${params}`, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getSkillProgress = async (agentId: string): Promise<SkillProgress> => {
  const response = await backendApi.get<SkillProgress>(`/agents/${agentId}/progress`, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
