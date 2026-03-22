import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchIndexEntry {
  id: string;
  user_id: string;
  resource_type: string;
  resource_id: string;
  title: string;
  content_preview?: string;
  tags: string[];
  updated_at?: string;
}

export interface IndexedSearchResponse {
  results: SearchIndexEntry[];
  total: number;
  query: string;
}

export interface SuggestionItem {
  title: string;
  resource_type: string;
  resource_id: string;
}

export interface SuggestionsResponse {
  suggestions: SuggestionItem[];
  query: string;
}

export interface ReindexResponse {
  indexed: Record<string, number>;
  errors: string[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Search the global search index using ILIKE on title.
 */
export async function indexedSearch(
  query: string,
  resourceType?: string,
  limit = 20,
): Promise<IndexedSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (resourceType) params.set('resource_type', resourceType);

  const response = await backendApi.get<IndexedSearchResponse>(
    `/global-search?${params.toString()}`,
    { showErrors: true },
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'indexed search' });
    throw new Error(response.error.message || 'Search failed');
  }

  return response.data!;
}

/**
 * Rebuild the search index from source tables.
 */
export async function reindexSearch(): Promise<ReindexResponse> {
  const response = await backendApi.post<ReindexResponse>(
    '/global-search/reindex',
    undefined,
    { showErrors: true },
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'reindex search' });
    throw new Error(response.error.message || 'Reindex failed');
  }

  return response.data!;
}

/**
 * Autocomplete suggestions based on title prefix.
 */
export async function searchSuggestions(
  query: string,
  limit = 5,
): Promise<SuggestionsResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });

  const response = await backendApi.get<SuggestionsResponse>(
    `/global-search/suggestions?${params.toString()}`,
    { showErrors: true },
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'search suggestions' });
    throw new Error(response.error.message || 'Suggestions failed');
  }

  return response.data!;
}
