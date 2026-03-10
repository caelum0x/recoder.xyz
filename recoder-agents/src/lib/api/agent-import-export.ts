import { backendApi } from '../api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentExportConfig {
  export_version: string;
  exported_at: string;
  agent: {
    name: string;
    system_prompt?: string;
    model?: string;
    model_provider?: string;
    is_default: boolean;
    icon_name?: string | null;
    icon_color?: string | null;
    icon_background?: string | null;
    metadata?: Record<string, any>;
  };
  tools: {
    agentpress_tools?: Record<string, any>;
    configured_mcps?: any[];
    custom_mcps?: any[];
  };
  knowledge_entries: Array<{
    title: string;
    content_type?: string;
    description?: string;
  }>;
  secret_keys: string[];
  schedules: Array<{
    name: string;
    cron_expression: string;
    timezone: string;
    input_message?: string;
    is_active: boolean;
    max_runs?: number;
  }>;
  quota_config?: {
    max_runs_per_day?: number | null;
    max_tokens_per_day?: number | null;
    max_cost_per_day?: number | null;
    max_runs_per_month?: number | null;
    max_tokens_per_month?: number | null;
    max_cost_per_month?: number | null;
    alert_threshold_pct?: number;
    is_enforced?: boolean;
  } | null;
}

export interface AgentImportResult {
  agent_id: string;
  name: string;
  created_at: string;
  imported: {
    tools: boolean;
    schedules: number;
    quota: boolean;
    secret_keys_required: string[];
    knowledge_entries_referenced: number;
  };
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function exportAgent(
  agentId: string,
  options?: {
    includeKnowledge?: boolean;
    includeSchedules?: boolean;
    includeQuota?: boolean;
  }
): Promise<AgentExportConfig> {
  const params = new URLSearchParams();
  if (options?.includeKnowledge === false) params.set('include_knowledge', 'false');
  if (options?.includeSchedules === false) params.set('include_schedules', 'false');
  if (options?.includeQuota === false) params.set('include_quota', 'false');
  const qs = params.toString();

  const response = await backendApi.get<AgentExportConfig>(
    `/agents/${agentId}/export${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function downloadAgentExport(
  agentId: string,
  options?: {
    includeKnowledge?: boolean;
    includeSchedules?: boolean;
    includeQuota?: boolean;
  }
): Promise<Blob> {
  const params = new URLSearchParams();
  if (options?.includeKnowledge === false) params.set('include_knowledge', 'false');
  if (options?.includeSchedules === false) params.set('include_schedules', 'false');
  if (options?.includeQuota === false) params.set('include_quota', 'false');
  const qs = params.toString();

  const response = await backendApi.post<any>(
    `/agents/${agentId}/export/download${qs ? `?${qs}` : ''}`,
    undefined,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);

  // If the API returns JSON directly, convert to blob
  const data = response.data;
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return new Blob([jsonStr], { type: 'application/json' });
}

export async function importAgent(
  config: Record<string, any>,
  nameOverride?: string
): Promise<AgentImportResult> {
  const response = await backendApi.post<AgentImportResult>(
    '/agents/import',
    { config, name_override: nameOverride },
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}
