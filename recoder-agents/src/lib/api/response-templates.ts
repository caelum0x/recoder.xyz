import { backendApi } from '@/lib/api-client';

export interface ResponseTemplate {
  id: string;
  template_name: string;
  description?: string;
  category: string;
  template_body: string;
  variables: unknown[];
  output_format: string;
  agent_ids: string[];
  is_active: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateRender {
  id: string;
  template_id: string;
  agent_id?: string;
  thread_id?: string;
  rendered_output: string;
  variables_used: Record<string, unknown>;
  rendered_at: string;
}

export interface TemplateStats {
  total: number;
  by_category: Record<string, number>;
  by_format: Record<string, number>;
  top_templates: ResponseTemplate[];
}

export async function listResponseTemplates(params?: {
  category?: string;
  output_format?: string;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.output_format) qs.set('output_format', params.output_format);
  if (params?.limit) qs.set('limit', String(params.limit));
  const response = await backendApi.get<ResponseTemplate[]>(`/response-templates?${qs}`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getResponseTemplateStats() {
  const response = await backendApi.get<TemplateStats>('/response-templates/stats');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getResponseTemplate(id: string) {
  const response = await backendApi.get<ResponseTemplate>(`/response-templates/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function createResponseTemplate(data: {
  template_name: string;
  template_body: string;
  description?: string;
  category?: string;
  variables?: unknown[];
  output_format?: string;
  agent_ids?: string[];
}) {
  const response = await backendApi.post<ResponseTemplate>('/response-templates', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function updateResponseTemplate(id: string, data: Partial<ResponseTemplate>) {
  const response = await backendApi.patch<ResponseTemplate>(`/response-templates/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function deleteResponseTemplate(id: string) {
  const response = await backendApi.delete(`/response-templates/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function renderResponseTemplate(
  id: string,
  data: { variables: Record<string, string>; agent_id?: string; thread_id?: string },
) {
  const response = await backendApi.post<{ rendered_output: string; render_id: string }>(
    `/response-templates/${id}/render`,
    data,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function listTemplateRenders(templateId: string) {
  const response = await backendApi.get<TemplateRender[]>(
    `/response-templates/${templateId}/renders`,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}
