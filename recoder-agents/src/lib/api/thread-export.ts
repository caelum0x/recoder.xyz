import { backendApi } from '@/lib/api-client';

export type ExportFormat = 'markdown' | 'json' | 'txt';

export interface ExportOptions {
  format: ExportFormat;
  include_tool_calls?: boolean;
  include_metadata?: boolean;
}

export interface ExportResponse {
  content: string;
  format: ExportFormat;
  message_count: number;
  thread_id: string;
}

export const exportThread = async (
  threadId: string,
  options: ExportOptions
): Promise<ExportResponse> => {
  const response = await backendApi.post<ExportResponse>(
    `/threads/${threadId}/export`,
    {
      format: options.format,
      include_tool_calls: options.include_tool_calls ?? false,
      include_metadata: options.include_metadata ?? false,
    },
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to export thread');
  return response.data!;
};

export const getExportPdfUrl = (
  threadId: string,
  includeToolCalls: boolean = false,
  includeMetadata: boolean = true
): string => {
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  const params = new URLSearchParams({
    include_tool_calls: String(includeToolCalls),
    include_metadata: String(includeMetadata),
  });
  return `${API_URL}/threads/${threadId}/export/pdf?${params}`;
};
