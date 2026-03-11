import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThreadLabel {
  id: string;
  user_id: string;
  name: string;
  color: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  thread_count?: number;
  children?: ThreadLabel[];
}

export interface LabelAssignment {
  thread_id: string;
  label_id: string;
  user_id: string;
  assigned_at: string;
}

export interface LabelThread {
  thread_id: string;
  assigned_at: string;
}

export interface CreateLabelData {
  name: string;
  color?: string;
  parent_id?: string;
}

export interface UpdateLabelData {
  name?: string;
  color?: string;
  parent_id?: string | null;
  sort_order?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const createThreadLabel = async (
  data: CreateLabelData
): Promise<ThreadLabel> => {
  const response = await backendApi.post<ThreadLabel>('/thread-labels', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getThreadLabels = async (): Promise<ThreadLabel[]> => {
  const response = await backendApi.get<ThreadLabel[]>('/thread-labels', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateThreadLabel = async (
  labelId: string,
  data: UpdateLabelData
): Promise<ThreadLabel> => {
  const response = await backendApi.patch<ThreadLabel>(
    `/thread-labels/${labelId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteThreadLabel = async (labelId: string) => {
  const response = await backendApi.delete(`/thread-labels/${labelId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const assignLabel = async (threadId: string, labelId: string) => {
  const response = await backendApi.post(`/threads/${threadId}/labels`, {
    label_id: labelId,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const removeLabel = async (threadId: string, labelId: string) => {
  const response = await backendApi.delete(
    `/threads/${threadId}/labels/${labelId}`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const getThreadLabelsList = async (
  threadId: string
): Promise<ThreadLabel[]> => {
  const response = await backendApi.get<ThreadLabel[]>(
    `/threads/${threadId}/labels`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getLabelThreads = async (
  labelId: string
): Promise<LabelThread[]> => {
  const response = await backendApi.get<LabelThread[]>(
    `/thread-labels/${labelId}/threads`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
