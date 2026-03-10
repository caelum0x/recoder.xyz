import { backendApi } from '@/lib/api-client';

export interface ThreadFolder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  parent_id: string | null;
  display_order: number;
  created_at: string;
  thread_count?: number;
}

export interface FolderThread {
  thread_id: string;
  assigned_at: string;
}

export interface CreateFolderData {
  name: string;
  color?: string;
  icon?: string;
  parent_id?: string | null;
}

export interface UpdateFolderData {
  name?: string;
  color?: string;
  icon?: string;
  parent_id?: string | null;
  display_order?: number;
}

export const getThreadFolders = async (): Promise<ThreadFolder[]> => {
  const response = await backendApi.get<ThreadFolder[]>('/thread-folders', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createThreadFolder = async (data: CreateFolderData): Promise<ThreadFolder> => {
  const response = await backendApi.post<ThreadFolder>('/thread-folders', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateThreadFolder = async (
  folderId: string,
  data: UpdateFolderData
): Promise<ThreadFolder> => {
  const response = await backendApi.patch<ThreadFolder>(`/thread-folders/${folderId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteThreadFolder = async (folderId: string) => {
  const response = await backendApi.delete(`/thread-folders/${folderId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const assignThreadToFolder = async (threadId: string, folderId: string) => {
  const response = await backendApi.post(`/threads/${threadId}/folder`, {
    folder_id: folderId,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const removeThreadFromFolder = async (threadId: string, folderId: string) => {
  const response = await backendApi.delete(`/threads/${threadId}/folder/${folderId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const getFolderThreads = async (folderId: string): Promise<FolderThread[]> => {
  const response = await backendApi.get<FolderThread[]>(
    `/thread-folders/${folderId}/threads`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
