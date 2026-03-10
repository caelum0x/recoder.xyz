'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listIntegrations,
  disconnectIntegration,
  refreshIntegration,
  type IntegrationListResponse,
} from '@/lib/api/integrations';

export function useIntegrations() {
  return useQuery<IntegrationListResponse>({
    queryKey: ['integrations'],
    queryFn: listIntegrations,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useDisconnectIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) => disconnectIntegration(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}

export function useRefreshIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) => refreshIntegration(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}
