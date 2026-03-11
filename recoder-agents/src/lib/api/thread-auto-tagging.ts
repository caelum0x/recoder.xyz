import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoTagRule {
  id: string;
  user_id: string;
  tag_name: string;
  rule_type: 'keyword' | 'agent' | 'tool_used' | 'message_count' | 'sentiment' | 'regex';
  rule_config: Record<string, any>;
  color: string;
  is_active: boolean;
  match_count: number;
  created_at: string;
}

export interface ThreadAutoTag {
  id: string;
  user_id: string;
  thread_id: string;
  tag_name: string;
  rule_id: string | null;
  confidence: number;
  applied_at: string;
  rule_type?: string;
  color?: string;
}

export interface AutoTagStats {
  total_tags_applied: number;
  total_rules: number;
  tag_distribution: Array<{ tag_name: string; count: number }>;
  top_rules: Array<{ tag_name: string; rule_type: string; match_count: number; color: string }>;
}

export interface ApplyResult {
  status: string;
  applied: number;
  rules_evaluated: number;
}

export interface ApplyAllResult {
  status: string;
  threads_processed: number;
  tags_applied: number;
}

export interface CreateAutoTagRuleData {
  tag_name: string;
  rule_type: string;
  rule_config: Record<string, any>;
  color?: string;
}

export interface UpdateAutoTagRuleData {
  tag_name?: string;
  rule_type?: string;
  rule_config?: Record<string, any>;
  color?: string;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getAutoTagRules = async (): Promise<AutoTagRule[]> => {
  const response = await backendApi.get<AutoTagRule[]>('/auto-tags/rules', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createAutoTagRule = async (data: CreateAutoTagRuleData): Promise<AutoTagRule> => {
  const response = await backendApi.post<AutoTagRule>('/auto-tags/rules', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateAutoTagRule = async (
  ruleId: string,
  data: UpdateAutoTagRuleData
): Promise<AutoTagRule> => {
  const response = await backendApi.patch<AutoTagRule>(`/auto-tags/rules/${ruleId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteAutoTagRule = async (ruleId: string) => {
  const response = await backendApi.delete(`/auto-tags/rules/${ruleId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const applyAutoTags = async (threadId: string): Promise<ApplyResult> => {
  const response = await backendApi.post<ApplyResult>(`/auto-tags/apply/${threadId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const applyAllAutoTags = async (): Promise<ApplyAllResult> => {
  const response = await backendApi.post<ApplyAllResult>('/auto-tags/apply-all');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getThreadAutoTags = async (threadId: string): Promise<ThreadAutoTag[]> => {
  const response = await backendApi.get<ThreadAutoTag[]>(
    `/auto-tags/threads/${threadId}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAutoTagStats = async (): Promise<AutoTagStats> => {
  const response = await backendApi.get<AutoTagStats>('/auto-tags/stats', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
