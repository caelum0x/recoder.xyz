'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSecrets,
  createSecret,
  getSecret,
  revealSecret,
  updateSecret,
  deleteSecret,
  getSecretAccessLog,
  getSecretStats,
  type AgentSecret,
  type SecretAccessLog,
  type CreateSecretData,
  type UpdateSecretData,
  type SecretStats,
} from '@/lib/api/agent-secrets';

const secretsKey = (agentId?: string) =>
  agentId ? ['agent-secrets', agentId] : ['agent-secrets'];
const secretKey = (secretId: string) => ['agent-secret', secretId] as const;
const secretAccessLogKey = (secretId: string) => ['secret-access-log', secretId] as const;
const secretStatsKey = ['secret-stats'] as const;

export function useSecrets(agentId?: string) {
  return useQuery<AgentSecret[]>({
    queryKey: secretsKey(agentId),
    queryFn: () => listSecrets(agentId),
    staleTime: 30_000,
  });
}

export function useSecretStats() {
  return useQuery<SecretStats>({
    queryKey: secretStatsKey,
    queryFn: () => getSecretStats(),
    staleTime: 60_000,
  });
}

export function useCreateSecret() {
  const queryClient = useQueryClient();

  return useMutation<AgentSecret, Error, CreateSecretData>({
    mutationFn: (data) => createSecret(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-secrets'] });
      queryClient.invalidateQueries({ queryKey: secretStatsKey });
    },
  });
}

export function useUpdateSecret() {
  const queryClient = useQueryClient();

  return useMutation<AgentSecret, Error, { secretId: string; data: UpdateSecretData }>({
    mutationFn: ({ secretId, data }) => updateSecret(secretId, data),
    onSuccess: (_, { secretId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-secrets'] });
      queryClient.invalidateQueries({ queryKey: secretKey(secretId) });
      queryClient.invalidateQueries({ queryKey: secretStatsKey });
    },
  });
}

export function useDeleteSecret() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: (secretId) => deleteSecret(secretId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-secrets'] });
      queryClient.invalidateQueries({ queryKey: secretStatsKey });
    },
  });
}

export function useRevealSecret() {
  const queryClient = useQueryClient();

  return useMutation<AgentSecret, Error, string>({
    mutationFn: (secretId) => revealSecret(secretId),
    onSuccess: (_, secretId) => {
      // Refresh access count shown in list
      queryClient.invalidateQueries({ queryKey: ['agent-secrets'] });
      queryClient.invalidateQueries({ queryKey: secretKey(secretId) });
      queryClient.invalidateQueries({ queryKey: secretStatsKey });
    },
  });
}

export function useSecretAccessLog(secretId: string) {
  return useQuery<SecretAccessLog[]>({
    queryKey: secretAccessLogKey(secretId),
    queryFn: () => getSecretAccessLog(secretId),
    staleTime: 15_000,
    enabled: !!secretId,
  });
}
