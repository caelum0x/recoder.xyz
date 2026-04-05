import { requireSessionAccessToken } from '@/lib/auth/session-token';
import { resolveBrowserBackendApiUrl } from '@/lib/runtime-urls';

const API_URL = resolveBrowserBackendApiUrl();

const getHeaders = async () => {
  const accessToken = await requireSessionAccessToken();
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` };
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface TriggerTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  trigger_type: string;
  config_template: Record<string, any>;
  icon: string;
  is_builtin: boolean;
  user_id: string | null;
  usage_count: number;
  created_at: string;
}

export interface TriggerTemplateCreatePayload {
  name: string;
  description?: string;
  category: string;
  trigger_type: string;
  config_template: Record<string, any>;
  icon?: string;
}

export interface TriggerTemplateApplyPayload {
  agent_id: string;
  overrides?: Record<string, any>;
}

export interface TriggerTemplateApplyResult {
  status: string;
  trigger_type: string;
  template_name: string;
  created: Record<string, any> | null;
}

// ── API Functions ────────────────────────────────────────────────────────────

export const listTriggerTemplates = async (filters?: {
  category?: string;
  trigger_type?: string;
}): Promise<TriggerTemplate[]> => {
  const headers = await getHeaders();
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.trigger_type) params.set('trigger_type', filters.trigger_type);

  const qs = params.toString();
  const url = `${API_URL}/trigger-templates${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch trigger templates');
  }
  return response.json();
};

export const getTriggerTemplate = async (templateId: string): Promise<TriggerTemplate> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/trigger-templates/${templateId}`, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch trigger template');
  }
  return response.json();
};

export const createTriggerTemplate = async (
  payload: TriggerTemplateCreatePayload
): Promise<TriggerTemplate> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/trigger-templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to create trigger template');
  }
  return response.json();
};

export const applyTriggerTemplate = async (
  templateId: string,
  payload: TriggerTemplateApplyPayload
): Promise<TriggerTemplateApplyResult> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/trigger-templates/${templateId}/apply`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to apply trigger template');
  }
  return response.json();
};

export const seedTriggerTemplates = async (): Promise<{ status: string; seeded: number; total_builtin: number }> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/trigger-templates/seed`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) {
    throw new Error('Failed to seed trigger templates');
  }
  return response.json();
};
