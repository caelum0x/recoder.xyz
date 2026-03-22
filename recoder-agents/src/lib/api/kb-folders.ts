import { backendApi } from '@/lib/api-client';

// Types

export interface KbStats {
  total_entries: number;
  total_size: number;
  total_folders: number;
  folders: Array<{
    folder_id: string;
    folder_name: string;
    entry_count: number;
    folder_size: number;
  }>;
}

export interface MoveFolderResponse {
  status: string;
  folder_id: string;
  parent_folder_id: string | null;
}

export interface DuplicateFolderResponse {
  status: string;
  new_folder_id: string;
  new_folder_name: string;
  duplicated_entries: number;
}

export interface BulkMoveResponse {
  status: string;
  moved_count: number;
  total_requested: number;
}

export interface BulkDeleteResponse {
  status: string;
  deleted_count: number;
  total_requested: number;
}

// API functions

export const moveFolder = async (
  folderId: string,
  parentFolderId: string | null
): Promise<MoveFolderResponse> => {
  const response = await backendApi.post<MoveFolderResponse>(
    `/knowledge-base/folders/${folderId}/move`,
    { parent_folder_id: parentFolderId },
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to move folder');
  return response.data!;
};

export const duplicateFolder = async (
  folderId: string
): Promise<DuplicateFolderResponse> => {
  const response = await backendApi.post<DuplicateFolderResponse>(
    `/knowledge-base/folders/${folderId}/duplicate`,
    {},
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to duplicate folder');
  return response.data!;
};

export const bulkMoveEntries = async (
  entryIds: string[],
  targetFolderId: string
): Promise<BulkMoveResponse> => {
  const response = await backendApi.post<BulkMoveResponse>(
    `/knowledge-base/entries/bulk-move`,
    { entry_ids: entryIds, target_folder_id: targetFolderId },
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to move entries');
  return response.data!;
};

export const bulkDeleteEntries = async (
  entryIds: string[]
): Promise<BulkDeleteResponse> => {
  const response = await backendApi.post<BulkDeleteResponse>(
    `/knowledge-base/entries/bulk-delete`,
    { entry_ids: entryIds },
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to delete entries');
  return response.data!;
};

export const getKbStats = async (): Promise<KbStats> => {
  const response = await backendApi.get<KbStats>(
    `/knowledge-base/stats`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to fetch KB stats');
  return response.data!;
};
