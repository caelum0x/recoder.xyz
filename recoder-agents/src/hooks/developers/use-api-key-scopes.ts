import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getKeyScopes,
  setKeyScopes,
  getKeyRestrictions,
  setKeyRestrictions,
  validateKeyScope,
  type SetKeyRestrictionsData,
} from '@/lib/api/api-key-scopes';

export function useKeyScopes(keyId: string | null) {
  return useQuery({
    queryKey: ['key-scopes', keyId],
    queryFn: () => getKeyScopes(keyId!),
    enabled: !!keyId,
    staleTime: 30_000,
  });
}

export function useSetKeyScopes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ keyId, scopes }: { keyId: string; scopes: string[] }) =>
      setKeyScopes(keyId, scopes),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['key-scopes', variables.keyId] });
    },
  });
}

export function useKeyRestrictions(keyId: string | null) {
  return useQuery({
    queryKey: ['key-restrictions', keyId],
    queryFn: () => getKeyRestrictions(keyId!),
    enabled: !!keyId,
    staleTime: 30_000,
  });
}

export function useSetKeyRestrictions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ keyId, data }: { keyId: string; data: SetKeyRestrictionsData }) =>
      setKeyRestrictions(keyId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['key-restrictions', variables.keyId] });
    },
  });
}

export function useValidateKeyScope() {
  return useMutation({
    mutationFn: ({ keyId, scope }: { keyId: string; scope: string }) =>
      validateKeyScope(keyId, scope),
  });
}
