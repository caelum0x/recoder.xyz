import { backendApi } from '@/lib/api-client';

export interface SavedPrompt {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  usage_count: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export const createPrompt = async (data: {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
}): Promise<SavedPrompt> => {
  const response = await backendApi.post<SavedPrompt>('/prompts', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPrompts = async (
  category?: string,
  search?: string,
): Promise<SavedPrompt[]> => {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (search) params.set('search', search);
  const query = params.toString() ? `?${params}` : '';
  const response = await backendApi.get<SavedPrompt[]>(`/prompts${query}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePrompt = async (
  id: string,
  data: Partial<
    Pick<SavedPrompt, 'title' | 'content' | 'category' | 'tags' | 'is_pinned'>
  >,
): Promise<SavedPrompt> => {
  const response = await backendApi.patch<SavedPrompt>(`/prompts/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePrompt = async (id: string) => {
  const response = await backendApi.delete(`/prompts/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const markPromptUsed = async (id: string) => {
  const response = await backendApi.post(`/prompts/${id}/use`, {});
  if (response.error) throw new Error(response.error.message);
  return response.data;
};
