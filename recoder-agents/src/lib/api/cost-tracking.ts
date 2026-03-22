import { backendApi } from '@/lib/api-client';

// ============================================================================
// Interfaces
// ============================================================================

export interface CostRecord {
  id: string;
  user_id: string;
  agent_id: string | null;
  thread_id: string | null;
  model_name: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  operation_type: string;
  recorded_at: string;
}

export interface CostBudget {
  id: string;
  user_id: string;
  budget_name: string;
  agent_id: string | null;
  period: 'daily' | 'weekly' | 'monthly';
  budget_usd: number;
  alert_threshold_pct: number;
  is_active: boolean;
  created_at: string;
  current_usage_usd: number;
  usage_pct: number;
}

export interface CostSummary {
  total_cost_usd: number;
  total_tokens: number;
  by_agent: Record<string, number>;
  by_model: Record<string, number>;
  by_provider: Record<string, number>;
}

export interface CostTrend {
  date: string;
  cost_usd: number;
  tokens: number;
}

export interface RecordCostData {
  agent_id?: string;
  thread_id?: string;
  model_name: string;
  provider?: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  operation_type?: string;
}

export interface CreateBudgetData {
  budget_name: string;
  agent_id?: string;
  period: 'daily' | 'weekly' | 'monthly';
  budget_usd: number;
  alert_threshold_pct?: number;
}

export interface CostFilters {
  agent_id?: string;
  model_name?: string;
  provider?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const recordCost = async (data: RecordCostData): Promise<CostRecord> => {
  const response = await backendApi.post<CostRecord>('/costs/record', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const batchRecordCosts = async (
  records: RecordCostData[]
): Promise<{ inserted: number; records: CostRecord[] }> => {
  const response = await backendApi.post<{ inserted: number; records: CostRecord[] }>(
    '/costs/batch',
    { records }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listCosts = async (filters?: CostFilters): Promise<CostRecord[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.model_name) params.set('model_name', filters.model_name);
  if (filters?.provider) params.set('provider', filters.provider);
  if (filters?.from_date) params.set('from_date', filters.from_date);
  if (filters?.to_date) params.set('to_date', filters.to_date);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<CostRecord[]>(
    `/costs${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getCostSummary = async (): Promise<CostSummary> => {
  const response = await backendApi.get<CostSummary>('/costs/summary', { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getCostTrends = async (days?: number, agentId?: string): Promise<CostTrend[]> => {
  const params = new URLSearchParams();
  if (days !== undefined) params.set('days', String(days));
  if (agentId) params.set('agent_id', agentId);
  const qs = params.toString();
  const response = await backendApi.get<CostTrend[]>(
    `/costs/trends${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listBudgets = async (): Promise<CostBudget[]> => {
  const response = await backendApi.get<CostBudget[]>('/costs/budgets', { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createBudget = async (data: CreateBudgetData): Promise<CostBudget> => {
  const response = await backendApi.post<CostBudget>('/costs/budgets', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateBudget = async (
  id: string,
  data: Partial<CreateBudgetData> & { is_active?: boolean }
): Promise<CostBudget> => {
  const response = await backendApi.patch<CostBudget>(`/costs/budgets/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteBudget = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/costs/budgets/${id}`);
  if (response.error) throw new Error(response.error.message);
};

export const getBudgetAlerts = async (): Promise<CostBudget[]> => {
  const response = await backendApi.get<CostBudget[]>('/costs/budgets/alerts', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
