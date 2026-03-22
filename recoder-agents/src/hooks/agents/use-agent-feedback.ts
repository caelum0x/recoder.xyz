'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  submitFeedback,
  listFeedback,
  getFeedbackStats,
  listAllFeedback,
  updateFeedback,
  deleteFeedback,
  createCategory,
  listCategories,
  deleteCategory,
  type CreateFeedbackData,
  type FeedbackFilters,
} from '@/lib/api/agent-feedback';

export function useFeedback(agentId: string, filters?: FeedbackFilters) {
  return useQuery({
    queryKey: ['agent-feedback', agentId, filters],
    queryFn: () => listFeedback(agentId, filters),
    staleTime: 30000,
    enabled: !!agentId,
  });
}

export function useFeedbackStats(agentId: string) {
  return useQuery({
    queryKey: ['agent-feedback-stats', agentId],
    queryFn: () => getFeedbackStats(agentId),
    staleTime: 60000,
    enabled: !!agentId,
  });
}

export function useAllFeedback(filters?: {
  agent_id?: string;
  feedback_type?: import('@/lib/api/agent-feedback').FeedbackType;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['all-feedback', filters],
    queryFn: () => listAllFeedback(filters),
    staleTime: 30000,
  });
}

export function useSubmitFeedback(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFeedbackData) => submitFeedback(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-feedback', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-feedback-stats', agentId] });
      queryClient.invalidateQueries({ queryKey: ['all-feedback'] });
      toast.success('Feedback submitted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit feedback');
    },
  });
}

export function useUpdateFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { is_resolved?: boolean; comment?: string } }) =>
      updateFeedback(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-feedback'] });
      queryClient.invalidateQueries({ queryKey: ['agent-feedback-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-feedback'] });
      toast.success('Feedback updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update feedback');
    },
  });
}

export function useDeleteFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteFeedback(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-feedback'] });
      queryClient.invalidateQueries({ queryKey: ['agent-feedback-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-feedback'] });
      toast.success('Feedback deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete feedback');
    },
  });
}

export function useFeedbackCategories() {
  return useQuery({
    queryKey: ['feedback-categories'],
    queryFn: listCategories,
    staleTime: 60000,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { category_name: string; description?: string; color?: string }) =>
      createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-categories'] });
      toast.success('Category created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create category');
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-categories'] });
      toast.success('Category deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete category');
    },
  });
}
