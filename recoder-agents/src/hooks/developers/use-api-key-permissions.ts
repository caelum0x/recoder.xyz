import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getApiKeyPermissions,
  updateApiKeyPermissions,
  deleteApiKeyPermissions,
  testApiKey,
  type UpdateApiKeyPermissionsData,
} from '@/lib/api/api-key-permissions';

export function useApiKeyPermissions(keyId: string | null) {
  return useQuery({
    queryKey: ['api-key-permissions', keyId],
    queryFn: () => getApiKeyPermissions(keyId!),
    enabled: !!keyId,
    staleTime: 30_000,
  });
}

export function useUpdateApiKeyPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ keyId, data }: { keyId: string; data: UpdateApiKeyPermissionsData }) =>
      updateApiKeyPermissions(keyId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['api-key-permissions', variables.keyId] });
    },
  });
}

export function useDeleteApiKeyPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => deleteApiKeyPermissions(keyId),
    onSuccess: (_data, keyId) => {
      queryClient.invalidateQueries({ queryKey: ['api-key-permissions', keyId] });
    },
  });
}

export function useTestApiKey() {
  return useMutation({
    mutationFn: (keyId: string) => testApiKey(keyId),
  });
}
