import { backendApi } from '@/lib/api-client';

export interface ThreadTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  thread_count?: number;
}

export interface TagAssignment {
  thread_id: string;
  tag_id: string;
  user_id: string;
  assigned_at: string;
}

export interface TaggedThread {
  thread_id: string;
  assigned_at: string;
}

export interface CreateTagData {
  name: string;
  color?: string;
}

export interface UpdateTagData {
  name?: string;
  color?: string;
}

export const createTag = async (data: CreateTagData): Promise<ThreadTag> => {
  const response = await backendApi.post<ThreadTag>('/tags', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTags = async (): Promise<ThreadTag[]> => {
  const response = await backendApi.get<ThreadTag[]>('/tags', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateTag = async (
  tagId: string,
  data: UpdateTagData
): Promise<ThreadTag> => {
  const response = await backendApi.patch<ThreadTag>(`/tags/${tagId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteTag = async (tagId: string) => {
  const response = await backendApi.delete(`/tags/${tagId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const assignTag = async (
  threadId: string,
  tagId: string
) => {
  const response = await backendApi.post(`/threads/${threadId}/tags`, {
    tag_id: tagId,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const removeTag = async (threadId: string, tagId: string) => {
  const response = await backendApi.delete(
    `/threads/${threadId}/tags/${tagId}`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const getThreadTags = async (threadId: string): Promise<ThreadTag[]> => {
  const response = await backendApi.get<ThreadTag[]>(
    `/threads/${threadId}/tags`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTaggedThreads = async (
  tagId: string
): Promise<TaggedThread[]> => {
  const response = await backendApi.get<TaggedThread[]>(
    `/tags/${tagId}/threads`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const bulkTag = async (
  threadIds: string[],
  tagId: string
) => {
  const response = await backendApi.post('/threads/bulk-tag', {
    thread_ids: threadIds,
    tag_id: tagId,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data;
};
