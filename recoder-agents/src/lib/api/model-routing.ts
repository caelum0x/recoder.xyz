import { backendApi } from '@/lib/api-client';

export interface RoutingRule {
  id: string;
  user_id: string;
  agent_id: string;
  name: string;
  priority: number;
  condition_type: 'message_length' | 'keyword' | 'time_of_day' | 'cost_threshold' | 'complexity' | 'fallback';
  condition_value: Record<string, any>;
  target_model: string;
  is_active: boolean;
  hit_count: number;
  created_at: string;
}

export interface CreateRoutingRuleData {
  name: string;
  priority?: number;
  condition_type: string;
  condition_value: Record<string, any>;
  target_model: string;
}

export interface UpdateRoutingRuleData {
  name?: string;
  priority?: number;
  condition_type?: string;
  condition_value?: Record<string, any>;
  target_model?: string;
  is_active?: boolean;
}

export interface EvaluateRoutingResult {
  matched: boolean;
  rule_id: string | null;
  rule_name: string | null;
  target_model: string | null;
  condition_type: string | null;
}

export interface RoutingRuleStat {
  id: string;
  name: string;
  condition_type: string;
  target_model: string;
  hit_count: number;
  is_active: boolean;
}

export const listRoutingRules = async (agentId: string): Promise<RoutingRule[]> => {
  const response = await backendApi.get<RoutingRule[]>(
    `/agents/${agentId}/routing-rules`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createRoutingRule = async (
  agentId: string,
  data: CreateRoutingRuleData
): Promise<RoutingRule> => {
  const response = await backendApi.post<RoutingRule>(
    `/agents/${agentId}/routing-rules`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateRoutingRule = async (
  agentId: string,
  ruleId: string,
  data: UpdateRoutingRuleData
): Promise<RoutingRule> => {
  const response = await backendApi.patch<RoutingRule>(
    `/agents/${agentId}/routing-rules/${ruleId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteRoutingRule = async (
  agentId: string,
  ruleId: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/agents/${agentId}/routing-rules/${ruleId}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const evaluateRouting = async (
  agentId: string,
  message: string
): Promise<EvaluateRoutingResult> => {
  const response = await backendApi.post<EvaluateRoutingResult>(
    `/agents/${agentId}/routing-rules/evaluate`,
    { message }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getRoutingStats = async (
  agentId: string
): Promise<RoutingRuleStat[]> => {
  const response = await backendApi.get<RoutingRuleStat[]>(
    `/agents/${agentId}/routing-rules/stats`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
