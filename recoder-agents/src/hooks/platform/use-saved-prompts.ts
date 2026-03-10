import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
  markPromptUsed,
} from '@/lib/api/saved-prompts';

export function useSavedPrompts(category?: string, search?: string) {
  return useQuery({
    queryKey: ['saved-prompts', category, search],
    queryFn: () => getPrompts(category, search),
    staleTime: 30_000,
  });
}

export function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPrompt,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-prompts'] }),
  });
}

export function useUpdatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string } & Parameters<typeof updatePrompt>[1]) =>
      updatePrompt(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-prompts'] }),
  });
}

export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePrompt,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-prompts'] }),
  });
}

export function useMarkPromptUsed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markPromptUsed,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-prompts'] }),
  });
}
