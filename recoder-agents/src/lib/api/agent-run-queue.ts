import { backendApi } from '@/lib/api-client';

export interface QueueEntry {
  id: string;
  user_id: string;
  agent_id: string;
  run_id: string | null;
  priority: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  input_message: string | null;
  config: Record<string, any> | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  position: number | null;
}

export interface EnqueueRequest {
  agent_id: string;
  input_message?: string;
  priority?: number;
  config?: Record<string, any>;
}

export interface EnqueueResponse {
  id: string;
  agent_id: string;
  priority: number;
  status: string;
  position: number;
  queued_at: string;
}

export interface QueueStats {
  queued_count: number;
  running_count: number;
  avg_wait_time_seconds: number;
  completed_today: number;
}

export interface QueueSettings {
  max_concurrent_runs: number;
  default_priority: number;
  auto_retry_failed: boolean;
  max_retries: number;
}

export interface UpdateQueueSettingsRequest {
  max_concurrent_runs?: number;
  default_priority?: number;
  auto_retry_failed?: boolean;
  max_retries?: number;
}

export interface QueueFilters {
  status?: string;
  agent_id?: string;
  limit?: number;
  offset?: number;
}

export const enqueueRun = async (data: EnqueueRequest): Promise<EnqueueResponse> => {
  const response = await backendApi.post<EnqueueResponse>(
    '/queue/enqueue',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to enqueue run: ${response.error.message}`);
  }

  return response.data!;
};

export const listQueueEntries = async (filters?: QueueFilters): Promise<QueueEntry[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const query = params.toString();
  const url = `/queue${query ? `?${query}` : ''}`;

  const response = await backendApi.get<QueueEntry[]>(url, {
    showErrors: true,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to list queue entries: ${response.error.message}`);
  }

  return response.data!;
};

export const cancelQueueEntry = async (entryId: string): Promise<void> => {
  const response = await backendApi.delete(`/queue/${entryId}`, {
    showErrors: true,
  });

  if (response.error) {
    throw new Error(`Failed to cancel queue entry: ${response.error.message}`);
  }
};

export const updateQueuePriority = async (
  entryId: string,
  priority: number
): Promise<void> => {
  const response = await backendApi.patch(
    `/queue/${entryId}/priority`,
    { priority },
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update priority: ${response.error.message}`);
  }
};

export const getQueueStats = async (): Promise<QueueStats> => {
  const response = await backendApi.get<QueueStats>('/queue/stats', {
    showErrors: true,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to get queue stats: ${response.error.message}`);
  }

  return response.data!;
};

export const getQueueSettings = async (): Promise<QueueSettings> => {
  const response = await backendApi.get<QueueSettings>('/queue/settings', {
    showErrors: true,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to get queue settings: ${response.error.message}`);
  }

  return response.data!;
};

export const updateQueueSettings = async (
  data: UpdateQueueSettingsRequest
): Promise<QueueSettings> => {
  const response = await backendApi.put<QueueSettings>(
    '/queue/settings',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update queue settings: ${response.error.message}`);
  }

  return response.data!;
};

export const processNextEntry = async (): Promise<{
  success: boolean;
  message?: string;
  entry?: QueueEntry;
}> => {
  const response = await backendApi.post<{
    success: boolean;
    message?: string;
    entry?: QueueEntry;
  }>('/queue/process-next', {}, { showErrors: true });

  if (response.error) {
    throw new Error(`Failed to process next entry: ${response.error.message}`);
  }

  return response.data!;
};
