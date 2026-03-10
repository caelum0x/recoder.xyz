import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPreferences,
  updatePreferences,
  resetPreferences,
  type UserPreferencesUpdate,
} from '@/lib/api/user-preferences';

export function useUserPreferences() {
  return useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => getPreferences(),
    staleTime: 60_000,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: UserPreferencesUpdate) => updatePreferences(updates),
    onSuccess: (data) => {
      queryClient.setQueryData(['user-preferences'], data);
    },
  });
}

export function useResetPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetPreferences(),
    onSuccess: (data) => {
      queryClient.setQueryData(['user-preferences'], data);
    },
  });
}
