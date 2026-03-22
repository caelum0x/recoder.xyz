import { backendApi } from '../api-client';

// ============================================================================
// Interfaces
// ============================================================================

export interface NotificationTemplate {
  id: string;
  user_id: string;
  template_name: string;
  event_type: string;
  channel: 'in_app' | 'email' | 'push' | 'webhook';
  subject_template?: string | null;
  body_template: string;
  variable_schema: string[];
  is_active: boolean;
  is_default: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationSend {
  id: string;
  template_id: string | null;
  user_id: string;
  channel: string;
  event_type: string;
  rendered_subject?: string | null;
  rendered_body: string;
  variables_used: Record<string, unknown>;
  status: 'sent' | 'failed' | 'pending';
  sent_at: string;
}

export interface CreateTemplateData {
  template_name: string;
  event_type: string;
  channel?: 'in_app' | 'email' | 'push' | 'webhook';
  subject_template?: string;
  body_template: string;
  variable_schema?: string[];
  is_default?: boolean;
}

export interface UpdateTemplateData {
  template_name?: string;
  event_type?: string;
  channel?: 'in_app' | 'email' | 'push' | 'webhook';
  subject_template?: string;
  body_template?: string;
  variable_schema?: string[];
  is_active?: boolean;
  is_default?: boolean;
}

export interface RenderResult {
  rendered_subject: string | null;
  rendered_body: string;
  send_id: string;
}

export interface TemplateStats {
  total_templates: number;
  by_channel: Record<string, number>;
  by_event_type: Record<string, number>;
  top_templates: Pick<NotificationTemplate, 'id' | 'template_name' | 'event_type' | 'channel' | 'use_count'>[];
  total_sends: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function listTemplates(filters?: {
  event_type?: string;
  channel?: string;
}): Promise<NotificationTemplate[]> {
  const params = new URLSearchParams();
  if (filters?.event_type) params.set('event_type', filters.event_type);
  if (filters?.channel) params.set('channel', filters.channel);
  const qs = params.toString();
  const response = await backendApi.get<NotificationTemplate[]>(
    `/notification-templates${qs ? `?${qs}` : ''}`,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function createTemplate(data: CreateTemplateData): Promise<NotificationTemplate> {
  const response = await backendApi.post<NotificationTemplate>('/notification-templates', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getTemplate(id: string): Promise<NotificationTemplate> {
  const response = await backendApi.get<NotificationTemplate>(`/notification-templates/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function updateTemplate(
  id: string,
  data: UpdateTemplateData,
): Promise<NotificationTemplate> {
  const response = await backendApi.patch<NotificationTemplate>(
    `/notification-templates/${id}`,
    data,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function deleteTemplate(id: string): Promise<{ deleted: boolean; template_id: string }> {
  const response = await backendApi.delete<{ deleted: boolean; template_id: string }>(
    `/notification-templates/${id}`,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function renderTemplate(
  id: string,
  variables: Record<string, string>,
): Promise<RenderResult> {
  const response = await backendApi.post<RenderResult>(
    `/notification-templates/${id}/render`,
    { variables },
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function listSends(options?: {
  limit?: number;
  event_type?: string;
}): Promise<NotificationSend[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.event_type) params.set('event_type', options.event_type);
  const qs = params.toString();
  const response = await backendApi.get<NotificationSend[]>(
    `/notification-templates/sends${qs ? `?${qs}` : ''}`,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getTemplateStats(): Promise<TemplateStats> {
  const response = await backendApi.get<TemplateStats>('/notification-templates/stats');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}
