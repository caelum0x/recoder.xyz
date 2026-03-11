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
    { showErrors: false }
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
    { showErrors: false }
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
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to get search history: ${response.error.message}`);
  }

  return response.data!;
};

export const getSearchSuggestions = async (): Promise<SearchSuggestions> => {
  const response = await backendApi.get<SearchSuggestions>(
    '/threads/search/suggestions',
    { showErrors: false, cache: 'no-store' }
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
