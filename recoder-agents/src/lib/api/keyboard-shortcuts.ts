import { backendApi } from '@/lib/api-client';

export interface KeyboardShortcut {
  id: string;
  user_id: string;
  action: string;
  key_combo: string;
  is_active: boolean;
  created_at: string;
}

export interface ShortcutInput {
  action: string;
  key_combo: string;
  is_active?: boolean;
}

export const getShortcuts = async (): Promise<KeyboardShortcut[]> => {
  const response = await backendApi.get<KeyboardShortcut[]>('/shortcuts', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const setShortcuts = async (
  shortcuts: ShortcutInput[],
): Promise<KeyboardShortcut[]> => {
  const response = await backendApi.put<KeyboardShortcut[]>('/shortcuts', {
    shortcuts,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const resetShortcut = async (action: string) => {
  const response = await backendApi.delete(`/shortcuts/${encodeURIComponent(action)}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const resetAllShortcuts = async () => {
  const response = await backendApi.post('/shortcuts/reset-all', {});
  if (response.error) throw new Error(response.error.message);
  return response.data;
};
