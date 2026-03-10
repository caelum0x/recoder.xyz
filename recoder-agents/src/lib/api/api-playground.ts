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
  body?: Record<string, any>;
  query_params?: Record<string, string>;
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
