import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricType =
  | 'api_calls'
  | 'tokens'
  | 'cost_usd'
  | 'storage_mb'
  | 'agents_count'
  | 'threads_count';

export type ThresholdType = 'absolute' | 'percentage';
export type ComparisonOp = 'gte' | 'lte' | 'gt' | 'lt';
export type AlertChannel = 'in_app' | 'email' | 'webhook';

export interface QuotaAlertRule {
  id: string;
  user_id: string;
  rule_name: string;
  metric_type: MetricType;
  agent_id: string | null;
  threshold_value: number;
  threshold_type: ThresholdType;
  comparison: ComparisonOp;
  alert_channel: AlertChannel;
  webhook_url: string | null;
  is_active: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
}

export interface QuotaAlertEvent {
  id: string;
  rule_id: string;
  user_id: string;
  metric_value: number;
  threshold_value: number;
  message: string | null;
  is_read: boolean;
  triggered_at: string;
}

export interface QuotaAlertStats {
  active_rules_count: number;
  unread_events_count: number;
  most_triggered_rule: string | null;
  events_by_metric: Record<string, number>;
}

export interface CreateAlertRuleData {
  rule_name: string;
  metric_type: MetricType;
  agent_id?: string;
  threshold_value: number;
  threshold_type?: ThresholdType;
  comparison?: ComparisonOp;
  alert_channel?: AlertChannel;
  webhook_url?: string;
  cooldown_minutes?: number;
}

export interface CheckQuotaData {
  metric_type: MetricType;
  metric_value: number;
  agent_id?: string;
}

export interface CheckQuotaResult {
  triggered_count: number;
  events: QuotaAlertEvent[];
}

export interface ListAlertEventsOptions {
  unread_only?: boolean;
  rule_id?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const listAlertRules = async (): Promise<QuotaAlertRule[]> => {
  const response = await backendApi.get<QuotaAlertRule[]>('/quota/rules', { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createAlertRule = async (data: CreateAlertRuleData): Promise<QuotaAlertRule> => {
  const response = await backendApi.post<QuotaAlertRule>('/quota/rules', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateAlertRule = async (
  id: string,
  data: Partial<CreateAlertRuleData> & { is_active?: boolean }
): Promise<QuotaAlertRule> => {
  const response = await backendApi.patch<QuotaAlertRule>(`/quota/rules/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteAlertRule = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/quota/rules/${id}`);
  if (response.error) throw new Error(response.error.message);
};

export const checkQuota = async (data: CheckQuotaData): Promise<CheckQuotaResult> => {
  const response = await backendApi.post<CheckQuotaResult>('/quota/check', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listAlertEvents = async (
  options?: ListAlertEventsOptions
): Promise<QuotaAlertEvent[]> => {
  const params = new URLSearchParams();
  if (options?.unread_only) params.set('unread_only', 'true');
  if (options?.rule_id) params.set('rule_id', options.rule_id);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const response = await backendApi.get<QuotaAlertEvent[]>(
    `/quota/events${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const markEventRead = async (eventId: string): Promise<void> => {
  const response = await backendApi.post(`/quota/events/${eventId}/read`, {});
  if (response.error) throw new Error(response.error.message);
};

export const markAllEventsRead = async (): Promise<void> => {
  const response = await backendApi.post('/quota/events/read-all', {});
  if (response.error) throw new Error(response.error.message);
};

export const getQuotaAlertStats = async (): Promise<QuotaAlertStats> => {
  const response = await backendApi.get<QuotaAlertStats>('/quota/stats', { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
