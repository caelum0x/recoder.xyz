import { backendApi } from '@/lib/api-client';

export type ExportFormat = 'json' | 'markdown' | 'csv' | 'pdf' | 'html';

export interface ExportOptions {
  include_tool_calls?: boolean;
  include_metadata?: boolean;
  include_timestamps?: boolean;
}

export interface CreateExportRequest {
  export_format: ExportFormat;
  options?: ExportOptions;
}

export interface ExportRecord {
  id: string;
  thread_id: string;
  export_format: ExportFormat;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  content?: string;
  file_size_bytes: number | null;
  options: Record<string, unknown>;
  error: string | null;
  message_count?: number;
  created_at: string;
  completed_at: string | null;
}

export const exportThreadV2 = async (
  threadId: string,
  request: CreateExportRequest
): Promise<ExportRecord> => {
  const response = await backendApi.post<ExportRecord>(
    `/threads/${threadId}/export-v2`,
    {
      export_format: request.export_format,
      options: {
        include_tool_calls: request.options?.include_tool_calls ?? false,
        include_metadata: request.options?.include_metadata ?? false,
        include_timestamps: request.options?.include_timestamps ?? true,
      },
    },
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to export thread');
  return response.data!;
};

export const getThreadExports = async (threadId: string): Promise<ExportRecord[]> => {
  const response = await backendApi.get<ExportRecord[]>(
    `/threads/${threadId}/exports-v2`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to fetch thread exports');
  return response.data!;
};

export const getExportDetail = async (exportId: string): Promise<ExportRecord> => {
  const response = await backendApi.get<ExportRecord>(
    `/exports-v2/${exportId}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to fetch export');
  return response.data!;
};

export const deleteExport = async (exportId: string): Promise<{ deleted: boolean; id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; id: string }>(
    `/exports-v2/${exportId}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to delete export');
  return response.data!;
};

export const getRecentExports = async (limit: number = 10): Promise<ExportRecord[]> => {
  const response = await backendApi.get<ExportRecord[]>(
    `/exports-v2/recent?limit=${limit}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to fetch recent exports');
  return response.data!;
};
