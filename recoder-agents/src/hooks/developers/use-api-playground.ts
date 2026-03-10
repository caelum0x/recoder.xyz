import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getPlaygroundEndpoints,
  executePlaygroundRequest,
  type ExecuteRequestData,
} from '@/lib/api/api-playground';

export function usePlaygroundEndpoints() {
  return useQuery({
    queryKey: ['api-playground', 'endpoints'],
    queryFn: getPlaygroundEndpoints,
    staleTime: 5 * 60_000, // endpoints don't change often
  });
}

export function useExecutePlaygroundRequest() {
  return useMutation({
    mutationFn: (data: ExecuteRequestData) => executePlaygroundRequest(data),
  });
}
