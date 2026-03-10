import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptSnippet {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: 'general' | 'system' | 'tool' | 'format' | 'persona' | 'safety' | 'custom';
  tags: string[];
  is_public: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface SnippetListResponse {
  snippets: PromptSnippet[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateSnippetRequest {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  is_public?: boolean;
}

export interface UpdateSnippetRequest {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  is_public?: boolean;
}

export interface PopularSnippetsResponse {
  snippets: PromptSnippet[];
}

export interface SnippetFilters {
  category?: string;
  search?: string;
  public_only?: boolean;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getPromptSnippets = async (
  filters?: SnippetFilters
): Promise<SnippetListResponse> => {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.public_only) params.set('public_only', 'true');
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<SnippetListResponse>(
    `/prompt-snippets${qs}`,
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) {
    throw new Error(`Failed to fetch snippets: ${response.error.message}`);
  }
  return response.data!;
};

export const getPromptSnippet = async (snippetId: string): Promise<PromptSnippet> => {
  const response = await backendApi.get<PromptSnippet>(
    `/prompt-snippets/${snippetId}`,
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) {
    throw new Error(`Failed to fetch snippet: ${response.error.message}`);
  }
  return response.data!;
};

export const createPromptSnippet = async (
  data: CreateSnippetRequest
): Promise<PromptSnippet> => {
  const response = await backendApi.post<PromptSnippet>(
    '/prompt-snippets',
    data,
    { showErrors: true }
  );
  if (response.error) {
    throw new Error(`Failed to create snippet: ${response.error.message}`);
  }
  return response.data!;
};

export const updatePromptSnippet = async (
  snippetId: string,
  data: UpdateSnippetRequest
): Promise<PromptSnippet> => {
  const response = await backendApi.patch<PromptSnippet>(
    `/prompt-snippets/${snippetId}`,
    data,
    { showErrors: true }
  );
  if (response.error) {
    throw new Error(`Failed to update snippet: ${response.error.message}`);
  }
  return response.data!;
};

export const deletePromptSnippet = async (
  snippetId: string
): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete<{ deleted: boolean }>(
    `/prompt-snippets/${snippetId}`,
    { showErrors: true }
  );
  if (response.error) {
    throw new Error(`Failed to delete snippet: ${response.error.message}`);
  }
  return response.data!;
};

export const recordSnippetUsage = async (
  snippetId: string,
  agentId: string
): Promise<{ recorded: boolean }> => {
  const response = await backendApi.post<{ recorded: boolean }>(
    `/prompt-snippets/${snippetId}/use`,
    { agent_id: agentId },
    { showErrors: false }
  );
  if (response.error) {
    throw new Error(`Failed to record usage: ${response.error.message}`);
  }
  return response.data!;
};

export const getPopularSnippets = async (
  limit: number = 10
): Promise<PopularSnippetsResponse> => {
  const response = await backendApi.get<PopularSnippetsResponse>(
    `/prompt-snippets/popular?limit=${limit}`,
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) {
    throw new Error(`Failed to fetch popular snippets: ${response.error.message}`);
  }
  return response.data!;
};
