import { backendApi } from '@/lib/api-client';

export interface VariableDefinition {
  name: string;
  description?: string;
}

export interface WebhookPayloadTemplate {
  id: string;
  user_id: string;
  template_name: string;
  description: string | null;
  trigger_event: string;
  payload_template: Record<string, unknown>;
  headers_template: Record<string, unknown>;
  variable_definitions: VariableDefinition[];
  is_active: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface WebhookTemplateRender {
  id: string;
  template_id: string;
  user_id: string;
  rendered_payload: Record<string, unknown>;
  variables_used: Record<string, unknown>;
  rendered_at: string;
}

export interface RenderResult {
  render: WebhookTemplateRender;
  rendered_payload: Record<string, unknown>;
}

export interface CreateTemplateData {
  template_name: string;
  description?: string;
  trigger_event: string;
  payload_template: Record<string, unknown>;
  headers_template?: Record<string, unknown>;
  variable_definitions?: VariableDefinition[];
}

export interface UpdateTemplateData {
  template_name?: string;
  description?: string;
  trigger_event?: string;
  payload_template?: Record<string, unknown>;
  headers_template?: Record<string, unknown>;
  variable_definitions?: VariableDefinition[];
  is_active?: boolean;
}

export interface RenderTemplateData {
  variables: Record<string, unknown>;
}

export const createWebhookTemplate = async (
  data: CreateTemplateData
): Promise<WebhookPayloadTemplate> => {
  const response = await backendApi.post<WebhookPayloadTemplate>(
    '/webhook-templates',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listWebhookTemplates = async (options?: {
  trigger_event?: string;
  limit?: number;
}): Promise<WebhookPayloadTemplate[]> => {
  const params = new URLSearchParams();
  if (options?.trigger_event) params.set('trigger_event', options.trigger_event);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const response = await backendApi.get<WebhookPayloadTemplate[]>(
    `/webhook-templates${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getWebhookTemplate = async (
  templateId: string
): Promise<WebhookPayloadTemplate> => {
  const response = await backendApi.get<WebhookPayloadTemplate>(
    `/webhook-templates/${templateId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateWebhookTemplate = async (
  templateId: string,
  data: UpdateTemplateData
): Promise<WebhookPayloadTemplate> => {
  const response = await backendApi.patch<WebhookPayloadTemplate>(
    `/webhook-templates/${templateId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteWebhookTemplate = async (
  templateId: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/webhook-templates/${templateId}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const renderWebhookTemplate = async (
  templateId: string,
  data: RenderTemplateData
): Promise<RenderResult> => {
  const response = await backendApi.post<RenderResult>(
    `/webhook-templates/${templateId}/render`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTemplateRenders = async (
  templateId: string,
  limit?: number
): Promise<WebhookTemplateRender[]> => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const response = await backendApi.get<WebhookTemplateRender[]>(
    `/webhook-templates/${templateId}/renders${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
