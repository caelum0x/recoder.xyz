import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitTier {
  id: string;
  user_id: string;
  tier_name: string;
  requests_per_minute: number;
  requests_per_hour: number;
  requests_per_day: number;
  burst_allowance: number;
  is_default: boolean;
  created_at: string;
}

export interface AgentRateAssignment {
  id: string;
  user_id: string;
  agent_id: string;
  tier_id: string;
  override_rpm: number | null;
  override_rph: number | null;
  is_active: boolean;
  assigned_at: string;
  tier_name: string | null;
}

export interface RateTierUsage {
  tier_id: string;
  tier_name: string;
  requests_per_minute: number;
  requests_per_hour: number;
  requests_per_day: number;
  burst_allowance: number;
  is_default: boolean;
  agent_count: number;
}

export interface CreateRateTierData {
  tier_name: string;
  requests_per_minute?: number;
  requests_per_hour?: number;
  requests_per_day?: number;
  burst_allowance?: number;
  is_default?: boolean;
}

export interface UpdateRateTierData {
  tier_name?: string;
  requests_per_minute?: number;
  requests_per_hour?: number;
  requests_per_day?: number;
  burst_allowance?: number;
  is_default?: boolean;
}

export interface AssignRateTierData {
  tier_id: string;
  override_rpm?: number | null;
  override_rph?: number | null;
}

// ============================================================================
// Tier API Functions
// ============================================================================

export const createRateTier = async (data: CreateRateTierData): Promise<RateLimitTier> => {
  const response = await backendApi.post<RateLimitTier>('/rate-tiers', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getRateTiers = async (): Promise<RateLimitTier[]> => {
  const response = await backendApi.get<RateLimitTier[]>('/rate-tiers', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
};

export const updateRateTier = async (
  tierId: string,
  data: UpdateRateTierData
): Promise<RateLimitTier> => {
  const response = await backendApi.patch<RateLimitTier>(`/rate-tiers/${tierId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteRateTier = async (tierId: string): Promise<void> => {
  const response = await backendApi.delete(`/rate-tiers/${tierId}`);
  if (response.error) throw new Error(response.error.message);
};

// ============================================================================
// Agent Assignment API Functions
// ============================================================================

export const assignRateTier = async (
  agentId: string,
  data: AssignRateTierData
): Promise<AgentRateAssignment> => {
  const response = await backendApi.post<AgentRateAssignment>(
    `/agents/${agentId}/rate-tier`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAgentRateTier = async (agentId: string): Promise<AgentRateAssignment> => {
  const response = await backendApi.get<AgentRateAssignment>(`/agents/${agentId}/rate-tier`, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const removeAgentRateTier = async (agentId: string): Promise<void> => {
  const response = await backendApi.delete(`/agents/${agentId}/rate-tier`);
  if (response.error) throw new Error(response.error.message);
};

// ============================================================================
// Usage Stats API Function
// ============================================================================

export const getRateTierUsage = async (): Promise<RateTierUsage[]> => {
  const response = await backendApi.get<RateTierUsage[]>('/rate-tiers/usage', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
};
