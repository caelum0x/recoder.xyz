import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getShortcuts,
  setShortcuts,
  resetShortcut,
  resetAllShortcuts,
} from '@/lib/api/keyboard-shortcuts';
import type { ShortcutInput } from '@/lib/api/keyboard-shortcuts';

export function useKeyboardShortcuts() {
  return useQuery({
    queryKey: ['keyboard-shortcuts'],
    queryFn: getShortcuts,
    staleTime: 30_000,
  });
}

export function useSetShortcuts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shortcuts: ShortcutInput[]) => setShortcuts(shortcuts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keyboard-shortcuts'] });
    },
  });
}

export function useResetShortcut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (action: string) => resetShortcut(action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keyboard-shortcuts'] });
    },
  });
}

export function useResetAllShortcuts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => resetAllShortcuts(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keyboard-shortcuts'] });
    },
  });
}
