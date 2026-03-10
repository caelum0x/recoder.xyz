import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

interface SearchResult {
  message_id: string;
  role: string;
  text: string;
  created_at: string | null;
}

interface SearchResponse {
  query: string;
  count: number;
  results: SearchResult[];
}

export function useThreadMessageSearch(threadId: string, query: string) {
  return useQuery({
    queryKey: ['thread-message-search', threadId, query],
    queryFn: async (): Promise<SearchResponse> => {
      const response = await backendApi.get<SearchResponse>(
        `/threads/${threadId}/search?q=${encodeURIComponent(query)}`,
        { showErrors: false }
      );
      if (response.error) return { query, count: 0, results: [] };
      return response.data!;
    },
    enabled: !!threadId && query.length >= 2,
    staleTime: 15_000,
  });
}
