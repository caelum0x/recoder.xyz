import { backendApi } from '@/lib/api-client';

export interface ThreadTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  initial_messages: Array<{ role: string; content: string }>;
  category: string;
  usage_count: number;
  created_at: string;
}

export const createThreadTemplate = async (data: {
  name: string;
  description?: string;
  agent_id?: string;
  initial_messages?: Array<{ role: string; content: string }>;
  category?: string;
}): Promise<ThreadTemplate> => {
  const response = await backendApi.post<ThreadTemplate>('/thread-templates', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getThreadTemplates = async (category?: string): Promise<ThreadTemplate[]> => {
  const query = category ? `?category=${category}` : '';
  const response = await backendApi.get<ThreadTemplate[]>(`/thread-templates${query}`, { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getThreadTemplate = async (id: string): Promise<ThreadTemplate> => {
  const response = await backendApi.get<ThreadTemplate>(`/thread-templates/${id}`, { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteThreadTemplate = async (id: string) => {
  const response = await backendApi.delete(`/thread-templates/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const createThreadFromTemplate = async (id: string): Promise<{ thread_id: string; name: string }> => {
  const response = await backendApi.post<{ thread_id: string; name: string }>(`/thread-templates/${id}/create-thread`, {});
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
