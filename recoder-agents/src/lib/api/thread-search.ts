import { backendApi } from '../api-client';

// ============================================================================
// Types
// ============================================================================

export interface ThreadSearchFilters {
  query?: string;
  agent_id?: string;
  has_tool_calls?: boolean;
  has_errors?: boolean;
  tags?: string[];
  date_from?: string;
  date_to?: string;
  sort_by?: 'recent' | 'oldest' | 'most_messages';
  limit?: number;
  offset?: number;
}

export interface ThreadSearchIndexEntry {
  id: string;
  thread_id: string;
  agent_id: string | null;
  content_preview: string | null;
  message_count: number;
  has_tool_calls: boolean;
  has_errors: boolean;
  last_message_at: string | null;
  tags: string[];
  indexed_at: string;
}

export interface ThreadSearchResponse {
  results: ThreadSearchIndexEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  filters: Record<string, any>;
  result_count: number;
  searched_at: string;
}

export interface SearchSuggestions {
  recent_queries: Array<{ query: string; last_used: string }>;
  popular_tags: Array<{ tag: string; count: number }>;
  active_agents: Array<{ agent_id: string; thread_count: number }>;
}

export interface IndexThreadRequest {
  agent_id?: string;
  content_preview?: string;
  message_count?: number;
  has_tool_calls?: boolean;
  has_errors?: boolean;
  last_message_at?: string;
  tags?: string[];
}

// ============================================================================
// API Functions
// ============================================================================

export const searchThreadsFiltered = async (
  filters: ThreadSearchFilters
): Promise<ThreadSearchResponse> => {
  const response = await backendApi.post<ThreadSearchResponse>(
    '/threads/search/filtered',
    {
      query: filters.query || undefined,
      agent_id: filters.agent_id || undefined,
      has_tool_calls: filters.has_tool_calls,
      has_errors: filters.has_errors,
      tags: filters.tags && filters.tags.length > 0 ? filters.tags : undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      sort_by: filters.sort_by || 'recent',
      limit: filters.limit || 20,
      offset: filters.offset || 0,
    },
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to search threads: ${response.error.message}`);
  }

  return response.data!;
};

export const indexThread = async (
  threadId: string,
  data: IndexThreadRequest
): Promise<ThreadSearchIndexEntry> => {
  const response = await backendApi.post<ThreadSearchIndexEntry>(
    `/threads/${threadId}/index`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to index thread: ${response.error.message}`);
  }

  return response.data!;
};

export const getSearchHistory = async (
  limit = 10
): Promise<{ history: SearchHistoryEntry[] }> => {
  const response = await backendApi.get<{ history: SearchHistoryEntry[] }>(
    `/threads/search/history?limit=${limit}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to get search history: ${response.error.message}`);
  }

  return response.data!;
};

export const getSearchSuggestions = async (): Promise<SearchSuggestions> => {
  const response = await backendApi.get<SearchSuggestions>(
    '/threads/search/suggestions',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to get search suggestions: ${response.error.message}`);
  }

  return response.data!;
};

export const clearSearchHistory = async (): Promise<{ success: boolean }> => {
  const response = await backendApi.delete<{ success: boolean }>(
    '/threads/search/history',
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to clear search history: ${response.error.message}`);
  }

  return response.data!;
};

// ============================================================================
// Sprint 72 Phase 2 — Thread Search Index
// ============================================================================

export interface ThreadSearchResult {
  id: string;
  user_id: string;
  thread_id: string;
  agent_id: string | null;
  title: string | null;
  content_snippet: string | null;
  message_count: number;
  last_message_at: string | null;
  tags: string[];
  indexed_at: string;
}

export interface SearchHistoryEntryV2 {
  id: string;
  user_id: string;
  query: string;
  results_count: number;
  searched_at: string;
}

export interface IndexThreadData {
  thread_id: string;
  agent_id?: string;
  title?: string;
  content_snippet?: string;
  message_count?: number;
  last_message_at?: string;
  tags?: string[];
}

export interface SearchFilters {
  q?: string;
  agent_id?: string;
  tags?: string;
  limit?: number;
}

export interface SearchStats {
  total_indexed: number;
  by_agent: Record<string, number>;
  recent_searches: number;
  top_queries: { query: string; count: number }[];
}

export const searchThreadsIndex = async (filters: SearchFilters): Promise<ThreadSearchResult[]> => {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.agent_id) params.set('agent_id', filters.agent_id);
  if (filters.tags) params.set('tags', filters.tags);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<ThreadSearchResult[]>(
    `/threads/search${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const indexThreadForSearch = async (data: IndexThreadData): Promise<ThreadSearchResult> => {
  const response = await backendApi.post<ThreadSearchResult>('/threads/index', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const indexThreadsBatch = async (
  threads: IndexThreadData[]
): Promise<{ indexed: number; errors: number }> => {
  const response = await backendApi.post<{ indexed: number; errors: number }>(
    '/threads/index/batch',
    { threads }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const removeFromIndex = async (threadId: string): Promise<void> => {
  const response = await backendApi.delete(`/threads/index/${threadId}`);
  if (response.error) throw new Error(response.error.message);
};

export const getSearchHistoryV2 = async (limit?: number): Promise<SearchHistoryEntryV2[]> => {
  const qs = limit !== undefined ? `?limit=${limit}` : '';
  const response = await backendApi.get<SearchHistoryEntryV2[]>(
    `/threads/search/history${qs}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getSearchStats = async (): Promise<SearchStats> => {
  const response = await backendApi.get<SearchStats>('/threads/search/stats', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
