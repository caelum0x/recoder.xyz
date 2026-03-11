import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getRecentAnnotations,
  getAnnotationSummary,
  type CreateAnnotationData,
  type UpdateAnnotationData,
  type AnnotationFilters,
} from '@/lib/api/thread-annotations';

export function useThreadAnnotations(threadId: string, filters?: AnnotationFilters) {
  return useQuery({
    queryKey: ['thread-annotations', threadId, filters],
    queryFn: () => listAnnotations(threadId, filters),
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

export function useCreateAnnotation(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAnnotationData) =>
      createAnnotation(threadId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-annotations', threadId] });
      qc.invalidateQueries({ queryKey: ['annotation-summary'] });
      qc.invalidateQueries({ queryKey: ['recent-annotations'] });
    },
  });
}

export function useUpdateAnnotation(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      annotationId,
      data,
    }: {
      annotationId: string;
      data: UpdateAnnotationData;
    }) => updateAnnotation(threadId, annotationId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-annotations', threadId] });
      qc.invalidateQueries({ queryKey: ['annotation-summary'] });
      qc.invalidateQueries({ queryKey: ['recent-annotations'] });
    },
  });
}

export function useDeleteAnnotation(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (annotationId: string) =>
      deleteAnnotation(threadId, annotationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-annotations', threadId] });
      qc.invalidateQueries({ queryKey: ['annotation-summary'] });
      qc.invalidateQueries({ queryKey: ['recent-annotations'] });
    },
  });
}

export function useRecentAnnotations(limit: number = 10) {
  return useQuery({
    queryKey: ['recent-annotations', limit],
    queryFn: () => getRecentAnnotations(limit),
    staleTime: 30_000,
  });
}

export function useAnnotationSummary() {
  return useQuery({
    queryKey: ['annotation-summary'],
    queryFn: () => getAnnotationSummary(),
    staleTime: 30_000,
  });
}
