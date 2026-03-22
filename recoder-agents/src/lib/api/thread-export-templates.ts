import { backendApi } from '@/lib/api-client';

export type ExportFormat = 'markdown' | 'html' | 'json' | 'csv' | 'txt';

export interface ExportTemplate {
  id: string;
  user_id: string;
  template_name: string;
  format: ExportFormat;
  include_metadata: boolean;
  include_tool_calls: boolean;
  include_timestamps: boolean;
  header_template: string | null;
  footer_template: string | null;
  custom_css: string | null;
  is_default: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface ThreadExport {
  id: string;
  user_id: string;
  thread_id: string;
  template_id: string | null;
  template_name: string | null;
  format: ExportFormat;
  export_size_bytes: number;
  message_count: number;
  exported_at: string;
}

export interface CreateExportTemplateData {
  template_name: string;
  format?: ExportFormat;
  include_metadata?: boolean;
  include_tool_calls?: boolean;
  include_timestamps?: boolean;
  header_template?: string;
  footer_template?: string;
  is_default?: boolean;
}

export interface UpdateExportTemplateData {
  template_name?: string;
  format?: ExportFormat;
  include_metadata?: boolean;
  include_tool_calls?: boolean;
  include_timestamps?: boolean;
  header_template?: string;
  footer_template?: string;
  is_default?: boolean;
}

export interface ExportTemplateStats {
  total_exports: number;
  by_format: Partial<Record<ExportFormat, number>>;
  top_templates: Array<Pick<ExportTemplate, 'id' | 'template_name' | 'format' | 'use_count'>>;
}

export interface ExportMessage {
  role: string;
  content: string;
  created_at?: string;
}

export interface ExportResult {
  rendered: string;
  format: ExportFormat;
  message_count: number;
  export_id: string | null;
}

export const listExportTemplates = async (): Promise<ExportTemplate[]> => {
  const response = await backendApi.get<ExportTemplate[]>(
    '/export-templates',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to list export templates: ${response.error.message}`);
  }

  return response.data!;
};

export const createExportTemplate = async (
  data: CreateExportTemplateData
): Promise<ExportTemplate> => {
  const response = await backendApi.post<ExportTemplate>(
    '/export-templates',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create export template: ${response.error.message}`);
  }

  return response.data!;
};

export const updateExportTemplate = async (
  id: string,
  data: UpdateExportTemplateData
): Promise<ExportTemplate> => {
  const response = await backendApi.patch<ExportTemplate>(
    `/export-templates/${id}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update export template: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteExportTemplate = async (id: string): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete<{ deleted: boolean }>(
    `/export-templates/${id}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete export template: ${response.error.message}`);
  }

  return response.data!;
};

export const exportThread = async (
  threadId: string,
  data: { template_id?: string; format?: ExportFormat; messages: ExportMessage[] }
): Promise<ExportResult> => {
  const response = await backendApi.post<ExportResult>(
    `/threads/${threadId}/export`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to export thread: ${response.error.message}`);
  }

  return response.data!;
};

export const getThreadExports = async (threadId: string): Promise<ThreadExport[]> => {
  const response = await backendApi.get<ThreadExport[]>(
    `/threads/${threadId}/exports`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch thread exports: ${response.error.message}`);
  }

  return response.data!;
};

export const getExportStats = async (): Promise<ExportTemplateStats> => {
  const response = await backendApi.get<ExportTemplateStats>(
    '/export-templates/stats',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch export stats: ${response.error.message}`);
  }

  return response.data!;
};
