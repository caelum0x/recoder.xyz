import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface CostAlertRule {
  id: string;
  user_id: string;
  agent_id?: string | null;
  agent_name?: string | null;
  name: string;
  threshold_amount: number;
  threshold_period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  alert_type: 'info' | 'warning' | 'critical';
  is_active: boolean;
  created_at: string;
}

export interface CreateCostAlertRuleData {
  agent_id?: string;
  name: string;
  threshold_amount: number;
  threshold_period?: string;
  alert_type?: string;
}

export interface UpdateCostAlertRuleData {
  name?: string;
  threshold_amount?: number;
  threshold_period?: string;
  alert_type?: string;
  is_active?: boolean;
}

export interface CostAlertHistoryEntry {
  id: string;
  rule_id: string;
  user_id: string;
  agent_id?: string | null;
  agent_name?: string | null;
  rule_name?: string | null;
  threshold_period?: string | null;
  alert_type?: string | null;
  triggered_amount: number;
  threshold_amount: number;
  status: 'triggered' | 'acknowledged' | 'resolved';
  triggered_at: string;
}

export interface CostAlertCheckResult {
  checked: number;
  triggered: number;
  alerts: CostAlertHistoryEntry[];
}

export interface CostAlertHistoryFilters {
  status?: string;
  agent_id?: string;
  limit?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const getCostAlertRules = async (): Promise<CostAlertRule[]> => {
  const response = await backendApi.get<CostAlertRule[]>(
    '/agent-cost-alerts/rules',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch cost alert rules: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const createCostAlertRule = async (data: CreateCostAlertRuleData): Promise<CostAlertRule> => {
  const response = await backendApi.post<CostAlertRule>(
    '/agent-cost-alerts/rules',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create cost alert rule: ${response.error.message}`);
  }

  return response.data!;
};

export const updateCostAlertRule = async (
  ruleId: string,
  data: UpdateCostAlertRuleData
): Promise<CostAlertRule> => {
  const response = await backendApi.patch<CostAlertRule>(
    `/agent-cost-alerts/rules/${ruleId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update cost alert rule: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteCostAlertRule = async (ruleId: string): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete<{ deleted: boolean }>(
    `/agent-cost-alerts/rules/${ruleId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete cost alert rule: ${response.error.message}`);
  }

  return response.data!;
};

export const checkCostAlerts = async (): Promise<CostAlertCheckResult> => {
  const response = await backendApi.post<CostAlertCheckResult>(
    '/agent-cost-alerts/check',
    undefined,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to check cost alerts: ${response.error.message}`);
  }

  return response.data!;
};

export const getCostAlertHistory = async (
  filters?: CostAlertHistoryFilters
): Promise<CostAlertHistoryEntry[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.limit) params.set('limit', String(filters.limit));

  const query = params.toString();
  const url = `/agent-cost-alerts/history${query ? `?${query}` : ''}`;

  const response = await backendApi.get<CostAlertHistoryEntry[]>(url, {
    showErrors: true,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch cost alert history: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const updateCostAlert = async (
  alertId: string,
  data: { status: string }
): Promise<CostAlertHistoryEntry> => {
  const response = await backendApi.patch<CostAlertHistoryEntry>(
    `/agent-cost-alerts/history/${alertId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update cost alert: ${response.error.message}`);
  }

  return response.data!;
};
