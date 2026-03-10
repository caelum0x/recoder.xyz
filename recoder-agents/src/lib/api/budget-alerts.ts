import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

export interface BudgetAlert {
  id: string;
  threshold_amount: number;
  alert_type: string;
  notified_at: string;
  created_at: string;
}

export interface CostSummary {
  daily_costs: { date: string; cost: number; agent_name?: string; model?: string }[];
  total_cost_this_month: number;
  total_cost_last_month: number;
  projected_monthly_cost: number;
  cost_by_agent: { agent_name: string; cost: number }[];
  cost_by_model: { model: string; cost: number }[];
}

export async function getCostSummary(period?: string): Promise<CostSummary> {
  try {
    const query = period ? `?period=${encodeURIComponent(period)}` : '';
    const response = await backendApi.get<CostSummary>(`/billing/cost-summary${query}`, { showErrors: false });
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get cost summary', resource: 'billing' });
    throw error;
  }
}

export async function getBudgetAlerts(): Promise<BudgetAlert[]> {
  try {
    const response = await backendApi.get<BudgetAlert[]>('/billing/budget-alerts', { showErrors: false });
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get budget alerts', resource: 'billing' });
    throw error;
  }
}

export async function setBudgetThreshold(amount: number): Promise<BudgetAlert> {
  try {
    const response = await backendApi.post<BudgetAlert>('/billing/budget-alerts', { threshold_amount: amount }, { showErrors: true });
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'set budget alert', resource: 'billing' });
    throw error;
  }
}
