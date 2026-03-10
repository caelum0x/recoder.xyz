import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listChecklists,
  getChecklist,
  createChecklist,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  seedDefaultChecklist,
  type CreateChecklistData,
  type CreateChecklistItemData,
  type UpdateChecklistItemData,
} from '@/lib/api/onboarding-checklists';
import { toast } from '@/lib/toast';

const CHECKLISTS_KEY = ['onboarding-checklists'];

export function useOnboardingChecklists(checklistType?: string) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, checklistType],
    queryFn: () => listChecklists(checklistType),
    staleTime: 30000,
  });
}

export function useChecklist(id: string | undefined) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, 'detail', id],
    queryFn: () => getChecklist(id!),
    enabled: !!id,
    staleTime: 15000,
  });
}

export function useCreateChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChecklistData) => createChecklist(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
      toast.success('Checklist created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create checklist');
    },
  });
}

export function useDeleteChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (checklistId: string) => deleteChecklist(checklistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
      toast.success('Checklist deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete checklist');
    },
  });
}

export function useAddChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ checklistId, data }: { checklistId: string; data: CreateChecklistItemData }) =>
      addChecklistItem(checklistId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add item');
    },
  });
}

export function useUpdateChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      checklistId,
      itemId,
      data,
    }: {
      checklistId: string;
      itemId: string;
      data: UpdateChecklistItemData;
    }) => updateChecklistItem(checklistId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update item');
    },
  });
}

export function useDeleteChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: string; itemId: string }) =>
      deleteChecklistItem(checklistId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete item');
    },
  });
}

export function useSeedChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => seedDefaultChecklist(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
      toast.success('Default checklist created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to seed checklist');
    },
  });
}
