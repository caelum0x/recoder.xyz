import { backendApi } from '../api-client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface KBFolder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  entry_count?: number;
}

export interface KBEntry {
  id: string;
  folder_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  embedding_status: 'pending' | 'processing' | 'embedded' | 'failed';
  agent_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface KBStats {
  total_files: number;
  total_embedded: number;
  total_pending: number;
  total_failed: number;
  total_folders: number;
  total_size_bytes: number;
}

export interface KBSearchResult {
  entries: KBEntry[];
  total: number;
}

export interface KBCloneGitRepoPayload {
  repo_url: string;
  branch?: string;
}

// ── Folder CRUD ──────────────────────────────────────────────────────────────

export const listFolders = async (): Promise<KBFolder[]> => {
  const response = await backendApi.get<KBFolder[]>(
    '/knowledge-base/folders',
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) throw new Error(`Failed to list folders: ${response.error.message}`);
  return response.data!;
};

export const createFolder = async (name: string, parentId?: string): Promise<KBFolder> => {
  const response = await backendApi.post<KBFolder>(
    '/knowledge-base/folders',
    { name, parent_id: parentId ?? null },
    { showErrors: true },
  );
  if (response.error) throw new Error(`Failed to create folder: ${response.error.message}`);
  return response.data!;
};

export const updateFolder = async (folderId: string, name: string): Promise<KBFolder> => {
  const response = await backendApi.put<KBFolder>(
    `/knowledge-base/folders/${folderId}`,
    { name },
    { showErrors: true },
  );
  if (response.error) throw new Error(`Failed to update folder: ${response.error.message}`);
  return response.data!;
};

export const deleteFolder = async (folderId: string): Promise<void> => {
  const response = await backendApi.delete(
    `/knowledge-base/folders/${folderId}`,
    { showErrors: true },
  );
  if (response.error) throw new Error(`Failed to delete folder: ${response.error.message}`);
};

// ── Entry operations ─────────────────────────────────────────────────────────

export const listEntries = async (folderId: string): Promise<KBEntry[]> => {
  const response = await backendApi.get<KBEntry[]>(
    `/knowledge-base/folders/${folderId}/entries`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) throw new Error(`Failed to list entries: ${response.error.message}`);
  return response.data!;
};

export const uploadFile = async (folderId: string, file: File): Promise<KBEntry> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await backendApi.upload<KBEntry>(
    `/knowledge-base/folders/${folderId}/upload`,
    formData,
    { showErrors: true, timeout: 120000 },
  );
  if (response.error) throw new Error(`Failed to upload file: ${response.error.message}`);
  return response.data!;
};

export const deleteEntry = async (entryId: string): Promise<void> => {
  const response = await backendApi.delete(
    `/knowledge-base/entries/${entryId}`,
    { showErrors: true },
  );
  if (response.error) throw new Error(`Failed to delete entry: ${response.error.message}`);
};

// ── Search ───────────────────────────────────────────────────────────────────

export const searchEntries = async (query: string): Promise<KBSearchResult> => {
  const response = await backendApi.get<KBSearchResult>(
    `/knowledge-base/search?q=${encodeURIComponent(query)}`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) throw new Error(`Failed to search entries: ${response.error.message}`);
  return response.data!;
};

// ── Git clone ────────────────────────────────────────────────────────────────

export const cloneGitRepo = async (
  folderId: string,
  payload: KBCloneGitRepoPayload,
): Promise<KBEntry[]> => {
  const response = await backendApi.post<KBEntry[]>(
    `/knowledge-base/folders/${folderId}/clone-git-repo`,
    payload,
    { showErrors: true, timeout: 300000 },
  );
  if (response.error) throw new Error(`Failed to clone repo: ${response.error.message}`);
  return response.data!;
};

// ── Stats ────────────────────────────────────────────────────────────────────

export const getStats = async (): Promise<KBStats> => {
  const response = await backendApi.get<KBStats>(
    '/knowledge-base/stats',
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) throw new Error(`Failed to get stats: ${response.error.message}`);
  return response.data!;
};

// ── Bulk operations ──────────────────────────────────────────────────────────

export const bulkAssignAgents = async (
  entryIds: string[],
  agentIds: string[],
): Promise<void> => {
  const response = await backendApi.patch(
    '/knowledge-base/entries/bulk-assign',
    { entry_ids: entryIds, agent_ids: agentIds },
    { showErrors: true },
  );
  if (response.error) throw new Error(`Failed to assign agents: ${response.error.message}`);
};

export const bulkMoveEntries = async (
  entryIds: string[],
  targetFolderId: string,
): Promise<void> => {
  const response = await backendApi.patch(
    '/knowledge-base/entries/bulk-move',
    { entry_ids: entryIds, target_folder_id: targetFolderId },
    { showErrors: true },
  );
  if (response.error) throw new Error(`Failed to move entries: ${response.error.message}`);
};

// ── Backfill embeddings ──────────────────────────────────────────────────────

export const backfillEmbeddings = async (): Promise<{ queued: number }> => {
  const response = await backendApi.post<{ queued: number }>(
    '/knowledge-base/backfill-embeddings',
    {},
    { showErrors: true },
  );
  if (response.error) throw new Error(`Failed to backfill embeddings: ${response.error.message}`);
  return response.data!;
};
