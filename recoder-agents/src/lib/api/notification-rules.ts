import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface RuleCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value: string | number;
}

export interface RuleAction {
  type: 'in_app' | 'email' | 'webhook';
  config: Record<string, any>;
}

export type TriggerEvent =
  | 'run_completed'
  | 'run_failed'
  | 'cost_exceeded'
  | 'agent_error'
  | 'health_degraded'
  | 'quota_warning'
  | 'thread_completed'
  | 'schedule_missed';

export interface NotificationRule {
  id: string;
  name: string;
  description?: string | null;
  trigger_event: TriggerEvent;
  conditions: RuleCondition[];
  actions: RuleAction[];
  is_active: boolean;
  last_triggered_at?: string | null;
  trigger_count: number;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationRuleDetail extends NotificationRule {
  recent_logs: RuleLogEntry[];
}

export interface CreateNotificationRuleRequest {
  name: string;
  description?: string;
  trigger_event: TriggerEvent;
  conditions?: RuleCondition[];
  actions?: RuleAction[];
  cooldown_minutes?: number;
}

export interface UpdateNotificationRuleRequest {
  name?: string;
  description?: string;
  trigger_event?: TriggerEvent;
  conditions?: RuleCondition[];
  actions?: RuleAction[];
  is_active?: boolean;
  cooldown_minutes?: number;
}

export interface RuleLogEntry {
  id: string;
  rule_id: string;
  trigger_event: string;
  conditions_met: Record<string, any>;
  actions_taken: Array<Record<string, any>>;
  created_at: string;
}

export interface RuleLogListResponse {
  logs: RuleLogEntry[];
  total: number;
}

export interface TestRuleResult {
  rule_id: string;
  rule_name: string;
  trigger_event: string;
  conditions_evaluated: Array<{
    field: string;
    operator: string;
    expected: any;
    actual: any;
    met: boolean;
    reason?: string;
  }>;
  all_conditions_met: boolean;
  actions_that_would_fire: Array<{
    type: string;
    config: Record<string, any>;
    would_execute: boolean;
  }>;
  cooldown_active: boolean;
}

// ============================================================================
// API Functions
// ============================================================================

export const notificationRulesApi = {
  async getRules(): Promise<NotificationRule[]> {
    const response = await backendApi.get<NotificationRule[]>('/notification-rules');
    if (response.error) throw response.error;
    return response.data ?? [];
  },

  async getRule(ruleId: string): Promise<NotificationRuleDetail> {
    const response = await backendApi.get<NotificationRuleDetail>(
      `/notification-rules/${ruleId}`
    );
    if (response.error) throw response.error;
    return response.data!;
  },

  async createRule(request: CreateNotificationRuleRequest): Promise<NotificationRule> {
    const response = await backendApi.post<NotificationRule>(
      '/notification-rules',
      request
    );
    if (response.error) throw response.error;
    return response.data!;
  },

  async updateRule(
    ruleId: string,
    request: UpdateNotificationRuleRequest
  ): Promise<NotificationRule> {
    const response = await backendApi.patch<NotificationRule>(
      `/notification-rules/${ruleId}`,
      request
    );
    if (response.error) throw response.error;
    return response.data!;
  },

  async deleteRule(ruleId: string): Promise<void> {
    const response = await backendApi.delete(`/notification-rules/${ruleId}`);
    if (response.error) throw response.error;
  },

  async testRule(ruleId: string): Promise<TestRuleResult> {
    const response = await backendApi.post<TestRuleResult>(
      `/notification-rules/${ruleId}/test`
    );
    if (response.error) throw response.error;
    return response.data!;
  },

  async getRuleLog(
    ruleId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<RuleLogListResponse> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (ruleId) params.append('rule_id', ruleId);

    const response = await backendApi.get<RuleLogListResponse>(
      `/notification-rules/log?${params}`
    );
    if (response.error) throw response.error;
    return response.data ?? { logs: [], total: 0 };
  },
};
