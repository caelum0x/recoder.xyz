import { backendApi } from '@/lib/api-client';

export interface LabelDefinition {
  id: string;
  user_id: string;
  label_name: string;
  color: string;
  description: string | null;
  icon: string;
  thread_count?: number;
  created_at: string;
}

export interface LabelAssignment {
  id: string;
  user_id: string;
  thread_id: string;
  label_id: string;
  assigned_at: string;
  // joined fields
  label_name?: string;
  color?: string;
  description?: string | null;
  icon?: string;
}

export interface CreateLabelData {
  label_name: string;
  color?: string;
  description?: string;
  icon?: string;
}

export interface UpdateLabelData {
  label_name?: string;
  color?: string;
  description?: string;
  icon?: string;
}

export interface BulkAssignData {
  label_id: string;
  thread_ids: string[];
}

export const listLabels = async (): Promise<LabelDefinition[]> => {
  const response = await backendApi.get<LabelDefinition[]>('/labels', { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createLabel = async (data: CreateLabelData): Promise<LabelDefinition> => {
  const response = await backendApi.post<LabelDefinition>('/labels', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateLabel = async (id: string, data: UpdateLabelData): Promise<LabelDefinition> => {
  const response = await backendApi.patch<LabelDefinition>(`/labels/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteLabel = async (id: string): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete(`/labels/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data as { deleted: boolean };
};

export const assignLabel = async (threadId: string, labelId: string): Promise<LabelAssignment> => {
  const response = await backendApi.post<LabelAssignment>(`/threads/${threadId}/labels`, { label_id: labelId });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const removeLabel = async (threadId: string, labelId: string): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete(`/threads/${threadId}/labels/${labelId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data as { deleted: boolean };
};

export const getThreadLabels = async (threadId: string): Promise<LabelAssignment[]> => {
  const response = await backendApi.get<LabelAssignment[]>(`/threads/${threadId}/labels`, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getLabelThreads = async (labelId: string): Promise<{ thread_id: string; assigned_at: string }[]> => {
  const response = await backendApi.get<{ thread_id: string; assigned_at: string }[]>(
    `/labels/${labelId}/threads`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const bulkAssignLabel = async (data: BulkAssignData): Promise<{ assigned_count: number }> => {
  const response = await backendApi.post<{ assigned_count: number }>('/labels/bulk-assign', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
