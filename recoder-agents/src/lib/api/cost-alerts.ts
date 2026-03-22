import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostAlertRule {
  id: string;
  name: string;
  alert_type: 'monthly_spend' | 'daily_spend' | 'per_agent' | 'per_model';
  threshold_amount: number;
  agent_id?: string;
  model_filter?: string;
  notify_channels: string[];
  active: boolean;
  last_triggered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCostAlertPayload {
  name: string;
  alert_type: string;
  threshold_amount: number;
  agent_id?: string;
  model_filter?: string;
  notify_channels?: string[];
}

export interface UpdateCostAlertPayload {
  name?: string;
  threshold_amount?: number;
  agent_id?: string;
  model_filter?: string;
  notify_channels?: string[];
  active?: boolean;
}

export interface CostAlertHistoryItem {
  id: string;
  rule_id: string;
  alert_type: string;
  threshold_amount: number;
  actual_amount: number;
  percentage_of_threshold: number;
  agent_id?: string;
  model_filter?: string;
  message?: string;
  acknowledged: boolean;
  acknowledged_at?: string;
  created_at: string;
}

export interface CostAlertHistoryResponse {
  alerts: CostAlertHistoryItem[];
  total: number;
}

export interface CheckResult {
  rules_checked: number;
  alerts_triggered: number;
  results: Array<{
    rule_id: string;
    name: string;
    alert_type?: string;
    threshold?: number;
    actual?: number;
    percentage?: number;
    triggered?: boolean;
    status?: string;
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Alert type labels and presets
// ---------------------------------------------------------------------------

export const ALERT_TYPE_LABELS: Record<string, string> = {
  monthly_spend: 'Monthly Spend',
  daily_spend: 'Daily Spend',
  per_agent: 'Per Agent',
  per_model: 'Per Model',
};

export const ALERT_PRESETS = [
  { name: 'Monthly $10 warning', alert_type: 'monthly_spend', threshold_amount: 10 },
  { name: 'Monthly $50 warning', alert_type: 'monthly_spend', threshold_amount: 50 },
  { name: 'Monthly $100 warning', alert_type: 'monthly_spend', threshold_amount: 100 },
  { name: 'Daily $5 limit', alert_type: 'daily_spend', threshold_amount: 5 },
  { name: 'Daily $20 limit', alert_type: 'daily_spend', threshold_amount: 20 },
] as const;

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function createCostAlert(
  payload: CreateCostAlertPayload,
): Promise<CostAlertRule> {
  try {
    const response = await backendApi.post<CostAlertRule>(
      '/cost-alerts',
      payload,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'create cost alert', resource: 'cost-alerts' });
    throw error;
  }
}

export async function listCostAlerts(
  activeOnly?: boolean,
): Promise<CostAlertRule[]> {
  try {
    const params = new URLSearchParams();
    if (activeOnly) params.set('active_only', 'true');
    const qs = params.toString();

    const response = await backendApi.get<CostAlertRule[]>(
      `/cost-alerts${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list cost alerts', resource: 'cost-alerts' });
    throw error;
  }
}

export async function updateCostAlert(
  ruleId: string,
  payload: UpdateCostAlertPayload,
): Promise<CostAlertRule> {
  try {
    const response = await backendApi.patch<CostAlertRule>(
      `/cost-alerts/${ruleId}`,
      payload,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'update cost alert', resource: 'cost-alerts' });
    throw error;
  }
}

export async function deleteCostAlert(
  ruleId: string,
): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/cost-alerts/${ruleId}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
  } catch (error) {
    handleApiError(error, { operation: 'delete cost alert', resource: 'cost-alerts' });
    throw error;
  }
}

export async function getCostAlertHistory(
  options?: { rule_id?: string; limit?: number; offset?: number },
): Promise<CostAlertHistoryResponse> {
  try {
    const params = new URLSearchParams();
    if (options?.rule_id) params.set('rule_id', options.rule_id);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const qs = params.toString();

    const response = await backendApi.get<CostAlertHistoryResponse>(
      `/cost-alerts/history${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get cost alert history', resource: 'cost-alerts' });
    throw error;
  }
}

export async function checkCostAlertsNow(): Promise<CheckResult> {
  try {
    const response = await backendApi.post<CheckResult>(
      '/cost-alerts/check',
      undefined,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'check cost alerts', resource: 'cost-alerts' });
    throw error;
  }
}
