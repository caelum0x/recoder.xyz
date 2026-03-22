import { backendApi } from '../api-client';

export interface CompressResult {
  compressed_messages: Array<{ role: string; content: string }>;
  original_count: number;
  compressed_count: number;
}

export async function compressThreadContext(
  threadId: string,
  messages: Array<{ role: string; content: string }>,
  preserveLastN = 4,
): Promise<CompressResult> {
  const response = await backendApi.post<CompressResult>(
    `/threads/${threadId}/compress`,
    { messages, preserve_last_n: preserveLastN },
    { showErrors: true },
  );

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || 'Context compression failed');
  }

  return response.data;
}
