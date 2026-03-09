import { useQuery } from '@tanstack/react-query';
import { getCostEstimate, type CostEstimate } from '@/lib/api/cost-estimate';

export function useCostEstimate(agentId: string, promptLength: number, model: string) {
  return useQuery<CostEstimate>({
    queryKey: ['cost-estimate', agentId, promptLength, model],
    queryFn: () => getCostEstimate(agentId, promptLength, model),
    enabled: promptLength > 0 && !!model,
    staleTime: 60_000,
  });
}
