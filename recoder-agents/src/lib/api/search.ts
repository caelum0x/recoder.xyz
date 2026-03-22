import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

export interface SearchResult {
  id: string;
  type: 'agent' | 'thread' | 'workflow' | 'knowledge';
  title: string;
  description?: string;
  url: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

export async function globalSearch(query: string, types?: string[]): Promise<SearchResponse> {
  try {
    const params = new URLSearchParams({ q: query });
    if (types?.length) params.set('types', types.join(','));
    const response = await backendApi.get<SearchResponse>(
      `/search?${params.toString()}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'global search', resource: 'search' });
    throw error;
  }
}
