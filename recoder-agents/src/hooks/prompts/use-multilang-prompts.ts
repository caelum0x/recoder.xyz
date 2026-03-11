import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createPromptSet,
  listPromptSets,
  getPromptSet,
  deletePromptSet,
  upsertVariant,
  listVariants,
  deleteVariant,
  getVariant,
  getMultilangStats,
  type CreatePromptSetData,
  type CreateVariantData,
} from '@/lib/api/multilang-prompts';

const SETS_KEY = 'multilang-prompt-sets';
const STATS_KEY = 'multilang-stats';

export function useMultilangPromptSets(filters?: {
  category?: string;
  search?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: [SETS_KEY, filters],
    queryFn: () => listPromptSets(filters),
    staleTime: 30_000,
  });
}

export function usePromptSetDetail(promptSetId: string | null) {
  return useQuery({
    queryKey: ['multilang-prompt-set', promptSetId],
    queryFn: () => getPromptSet(promptSetId!),
    enabled: !!promptSetId,
    staleTime: 20_000,
  });
}

export function useCreatePromptSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePromptSetData) => createPromptSet(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SETS_KEY] });
      qc.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

export function useDeletePromptSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (promptSetId: string) => deletePromptSet(promptSetId),
    onSuccess: (_data, promptSetId) => {
      qc.invalidateQueries({ queryKey: [SETS_KEY] });
      qc.invalidateQueries({ queryKey: ['multilang-prompt-set', promptSetId] });
      qc.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

export function useUpsertVariant(promptSetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVariantData) => upsertVariant(promptSetId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['multilang-variants', promptSetId] });
      qc.invalidateQueries({ queryKey: ['multilang-prompt-set', promptSetId] });
      qc.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

export function usePromptVariants(promptSetId: string | null) {
  return useQuery({
    queryKey: ['multilang-variants', promptSetId],
    queryFn: () => listVariants(promptSetId!),
    enabled: !!promptSetId,
    staleTime: 20_000,
  });
}

export function useDeleteVariant(promptSetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (languageCode: string) => deleteVariant(promptSetId, languageCode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['multilang-variants', promptSetId] });
      qc.invalidateQueries({ queryKey: ['multilang-prompt-set', promptSetId] });
      qc.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

export function usePromptVariant(
  promptSetId: string | null,
  languageCode: string | null
) {
  return useQuery({
    queryKey: ['multilang-variant', promptSetId, languageCode],
    queryFn: () => getVariant(promptSetId!, languageCode!),
    enabled: !!promptSetId && !!languageCode,
    staleTime: 20_000,
  });
}

export function useMultilangStats() {
  return useQuery({
    queryKey: [STATS_KEY],
    queryFn: getMultilangStats,
    staleTime: 60_000,
  });
}
