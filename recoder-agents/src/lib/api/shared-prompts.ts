import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptCategory =
  | 'general'
  | 'system'
  | 'coding'
  | 'writing'
  | 'analysis'
  | 'creative'
  | 'custom';

export interface SharedPrompt {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: PromptCategory;
  tags: string[];
  version: number;
  is_public: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface SharedPromptListResponse {
  prompts: SharedPrompt[];
  total: number;
  limit: number;
  offset: number;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  version: number;
  content: string;
  change_note: string | null;
  created_at: string;
}

export interface PromptVersionsResponse {
  versions: PromptVersion[];
  prompt_id: string;
}

export interface CreateSharedPromptRequest {
  title: string;
  content: string;
  category?: PromptCategory;
  tags?: string[];
  is_public?: boolean;
}

export interface UpdateSharedPromptRequest {
  title?: string;
  content?: string;
  category?: PromptCategory;
  tags?: string[];
  is_public?: boolean;
  change_note?: string;
}

export interface SharedPromptFilters {
  category?: string;
  search?: string;
  public_only?: boolean;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getSharedPrompts = async (
  filters?: SharedPromptFilters,
): Promise<SharedPromptListResponse> => {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.public_only) params.set('public_only', 'true');
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<SharedPromptListResponse>(
    `/prompts/shared${qs}`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch shared prompts: ${response.error.message}`);
  }
  return response.data!;
};

export const getSharedPrompt = async (promptId: string): Promise<SharedPrompt> => {
  const response = await backendApi.get<SharedPrompt>(
    `/prompts/shared/${promptId}`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch prompt: ${response.error.message}`);
  }
  return response.data!;
};

export const createSharedPrompt = async (
  data: CreateSharedPromptRequest,
): Promise<SharedPrompt> => {
  const response = await backendApi.post<SharedPrompt>(
    '/prompts/shared',
    data,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to create prompt: ${response.error.message}`);
  }
  return response.data!;
};

export const updateSharedPrompt = async (
  promptId: string,
  data: UpdateSharedPromptRequest,
): Promise<SharedPrompt> => {
  const response = await backendApi.patch<SharedPrompt>(
    `/prompts/shared/${promptId}`,
    data,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to update prompt: ${response.error.message}`);
  }
  return response.data!;
};

export const deleteSharedPrompt = async (
  promptId: string,
): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete<{ deleted: boolean }>(
    `/prompts/shared/${promptId}`,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to delete prompt: ${response.error.message}`);
  }
  return response.data!;
};

export const useSharedPromptContent = async (
  promptId: string,
): Promise<SharedPrompt> => {
  const response = await backendApi.post<SharedPrompt>(
    `/prompts/shared/${promptId}/use`,
    {},
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to use prompt: ${response.error.message}`);
  }
  return response.data!;
};

export const getPromptVersions = async (
  promptId: string,
): Promise<PromptVersionsResponse> => {
  const response = await backendApi.get<PromptVersionsResponse>(
    `/prompts/shared/${promptId}/versions`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch prompt versions: ${response.error.message}`);
  }
  return response.data!;
};

// Legacy re-exports for backward compatibility with prompt snippets hooks
export type PromptSnippet = SharedPrompt;
export type SnippetListResponse = SharedPromptListResponse;
export type CreateSnippetRequest = CreateSharedPromptRequest;
export type UpdateSnippetRequest = UpdateSharedPromptRequest;
export type SnippetFilters = SharedPromptFilters;
export type PopularSnippetsResponse = { snippets: SharedPrompt[] };

export const getPromptSnippets = getSharedPrompts;
export const getPromptSnippet = getSharedPrompt;
export const createPromptSnippet = createSharedPrompt;
export const updatePromptSnippet = updateSharedPrompt;
export const deletePromptSnippet = deleteSharedPrompt;
export const recordSnippetUsage = async (snippetId: string, _agentId: string) => {
  await useSharedPromptContent(snippetId);
  return { recorded: true };
};
export const getPopularSnippets = async (limit: number = 10): Promise<PopularSnippetsResponse> => {
  const data = await getSharedPrompts({ limit, public_only: false });
  // Sort by use_count descending for "popular"
  const sorted = [...data.prompts].sort((a, b) => b.use_count - a.use_count);
  return { snippets: sorted.slice(0, limit) };
};
