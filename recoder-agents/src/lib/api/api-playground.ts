import { backendApi } from '@/lib/api-client';

export interface PlaygroundEndpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: PlaygroundParameter[];
  request_body: Record<string, any> | null;
  operation_id: string;
}

export interface PlaygroundParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  description: string;
  schema: Record<string, any>;
}

export interface PlaygroundResponse {
  status_code: number;
  response_time_ms: number;
  body: any;
  headers: Record<string, string>;
  method: string;
  path: string;
}

export interface ExecuteRequestData {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, any>;
  query_params?: Record<string, string>;
}

export interface PlaygroundHistoryEntry {
  id: string;
  name: string | null;
  method: string;
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, any> | null;
  response_status: number | null;
  response_body: any;
  response_time_ms: number | null;
  is_saved: boolean;
  created_at: string;
}

export interface UpdateHistoryData {
  name?: string;
  is_saved?: boolean;
}

export const getPlaygroundEndpoints = async (): Promise<{
  endpoints: PlaygroundEndpoint[];
  total: number;
}> => {
  const response = await backendApi.get<{
    endpoints: PlaygroundEndpoint[];
    total: number;
  }>('/playground/endpoints', { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const executePlaygroundRequest = async (
  data: ExecuteRequestData
): Promise<PlaygroundResponse> => {
  const response = await backendApi.post<PlaygroundResponse>(
    '/playground/execute',
    data,
    { timeout: 35000 }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPlaygroundHistory = async (
  savedOnly: boolean = false,
  limit: number = 20,
  offset: number = 0
): Promise<PlaygroundHistoryEntry[]> => {
  const params = new URLSearchParams();
  if (savedOnly) params.set('saved_only', 'true');
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const response = await backendApi.get<PlaygroundHistoryEntry[]>(
    `/playground/history?${params.toString()}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const savePlaygroundEntry = async (
  entryId: string,
  data: UpdateHistoryData
): Promise<PlaygroundHistoryEntry> => {
  const response = await backendApi.patch<PlaygroundHistoryEntry>(
    `/playground/history/${entryId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePlaygroundEntry = async (
  entryId: string
): Promise<{ deleted: boolean; id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; id: string }>(
    `/playground/history/${entryId}`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
