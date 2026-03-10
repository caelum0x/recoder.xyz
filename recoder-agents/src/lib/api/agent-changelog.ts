import { backendApi } from '@/lib/api-client';

export interface ChangelogEntry {
  id: string;
  agent_id: string;
  user_id: string;
  change_type: string;
  description: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ChangelogListResponse {
  changes: ChangelogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface ChangelogCreateRequest {
  change_type: string;
  description?: string;
  old_value?: Record<string, any>;
  new_value?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ChangelogSummaryItem {
  change_type: string;
  count: number;
}

export interface ChangelogSummaryResponse {
  summary: ChangelogSummaryItem[];
  total_changes: number;
  period_days: number;
}

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  instructions_updated: 'Instructions Updated',
  tools_added: 'Tools Added',
  tools_removed: 'Tools Removed',
  tools_configured: 'Tools Configured',
  model_changed: 'Model Changed',
  name_changed: 'Name Changed',
  knowledge_added: 'Knowledge Added',
  knowledge_removed: 'Knowledge Removed',
  trigger_added: 'Trigger Added',
  trigger_removed: 'Trigger Removed',
  integration_added: 'Integration Added',
  integration_removed: 'Integration Removed',
  settings_changed: 'Settings Changed',
};

export const getAgentChangelog = async (
  agentId: string,
  options?: { changeType?: string; page?: number; pageSize?: number }
): Promise<ChangelogListResponse> => {
  const params = new URLSearchParams();
  if (options?.changeType) params.set('change_type', options.changeType);
  if (options?.page) params.set('page', String(options.page));
  if (options?.pageSize) params.set('page_size', String(options.pageSize));

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<ChangelogListResponse>(
    `/agents/${agentId}/changelog${query}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch changelog: ${response.error.message}`);
  }

  return response.data!;
};

export const createChangelogEntry = async (
  agentId: string,
  data: ChangelogCreateRequest
): Promise<ChangelogEntry> => {
  const response = await backendApi.post<ChangelogEntry>(
    `/agents/${agentId}/changelog`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create changelog entry: ${response.error.message}`);
  }

  return response.data!;
};

export const getChangelogSummary = async (
  agentId: string,
  days: number = 30
): Promise<ChangelogSummaryResponse> => {
  const response = await backendApi.get<ChangelogSummaryResponse>(
    `/agents/${agentId}/changelog/summary?days=${days}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch changelog summary: ${response.error.message}`);
  }

  return response.data!;
};

export const getChangelogDiff = async (
  agentId: string,
  changeId: string
): Promise<ChangelogEntry> => {
  const response = await backendApi.get<ChangelogEntry>(
    `/agents/${agentId}/changelog/diff/${changeId}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch changelog diff: ${response.error.message}`);
  }

  return response.data!;
};
