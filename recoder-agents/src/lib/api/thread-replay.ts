import { backendApi } from '@/lib/api-client';

export interface ThreadCheckpoint {
  id: string;
  user_id: string;
  thread_id: string;
  checkpoint_name: string | null;
  message_index: number;
  messages_snapshot: unknown[];
  agent_config_snapshot: Record<string, unknown>;
  created_at: string;
}

export interface ThreadReplay {
  id: string;
  user_id: string;
  source_thread_id: string;
  checkpoint_id: string | null;
  replay_thread_id: string | null;
  agent_id: string | null;
  agent_config_override: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  comparison_notes: string | null;
  created_at: string;
  completed_at: string | null;
  // joined fields from checkpoint
  checkpoint_name?: string | null;
  message_index?: number;
  messages_snapshot?: unknown[];
  agent_config_snapshot?: Record<string, unknown>;
  checkpoint_thread_id?: string;
}

export interface CreateCheckpointData {
  checkpoint_name?: string;
  message_index: number;
  messages_snapshot: unknown[];
  agent_config_snapshot?: Record<string, unknown>;
}

export interface CreateReplayData {
  checkpoint_id: string;
  agent_id?: string;
  agent_config_override?: Record<string, unknown>;
  replay_thread_id?: string;
}

export interface UpdateReplayData {
  comparison_notes?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

export const listCheckpoints = async (threadId: string): Promise<ThreadCheckpoint[]> => {
  const response = await backendApi.get<ThreadCheckpoint[]>(
    `/threads/${threadId}/checkpoints`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createCheckpoint = async (
  threadId: string,
  data: CreateCheckpointData
): Promise<ThreadCheckpoint> => {
  const response = await backendApi.post<ThreadCheckpoint>(
    `/threads/${threadId}/checkpoints`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteCheckpoint = async (
  threadId: string,
  checkpointId: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/threads/${threadId}/checkpoints/${checkpointId}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const createReplay = async (
  threadId: string,
  data: CreateReplayData
): Promise<ThreadReplay> => {
  const response = await backendApi.post<ThreadReplay>(
    `/threads/${threadId}/replay`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listReplays = async (threadId: string): Promise<ThreadReplay[]> => {
  const response = await backendApi.get<ThreadReplay[]>(
    `/threads/${threadId}/replays`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getReplay = async (replayId: string): Promise<ThreadReplay> => {
  const response = await backendApi.get<ThreadReplay>(
    `/replays/${replayId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateReplay = async (
  replayId: string,
  data: UpdateReplayData
): Promise<ThreadReplay> => {
  const response = await backendApi.patch<ThreadReplay>(
    `/replays/${replayId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteReplay = async (replayId: string): Promise<void> => {
  const response = await backendApi.delete(`/replays/${replayId}`);
  if (response.error) throw new Error(response.error.message);
};
