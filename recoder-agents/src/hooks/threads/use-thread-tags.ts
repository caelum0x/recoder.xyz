import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createTag,
  getTags,
  updateTag,
  deleteTag,
  assignTag,
  removeTag,
  getThreadTags,
  getTaggedThreads,
  bulkTag,
  type CreateTagData,
  type UpdateTagData,
} from '@/lib/api/thread-tags';

const tagKeys = {
  all: ['thread-tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  thread: (threadId: string) => [...tagKeys.all, 'thread', threadId] as const,
  tagged: (tagId: string) => [...tagKeys.all, 'tagged', tagId] as const,
};

export function useThreadTags() {
  return useQuery({
    queryKey: tagKeys.lists(),
    queryFn: getTags,
    staleTime: 60_000,
    retry: false,
  });
}

export function useThreadTagAssignments(
  threadId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: tagKeys.thread(threadId),
    queryFn: () => getThreadTags(threadId),
    enabled: !!threadId && (options?.enabled !== false),
    staleTime: 30_000,
    retry: false,
  });
}

export function useTaggedThreads(tagId: string) {
  return useQuery({
    queryKey: tagKeys.tagged(tagId),
    queryFn: () => getTaggedThreads(tagId),
    enabled: !!tagId,
    staleTime: 30_000,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTagData) => createTag(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, data }: { tagId: string; data: UpdateTagData }) =>
      updateTag(tagId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => deleteTag(tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useAssignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      tagId,
    }: {
      threadId: string;
      tagId: string;
    }) => assignTag(threadId, tagId),
    onSuccess: (_data, { threadId }) => {
      qc.invalidateQueries({ queryKey: tagKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

export function useRemoveTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      tagId,
    }: {
      threadId: string;
      tagId: string;
    }) => removeTag(threadId, tagId),
    onSuccess: (_data, { threadId }) => {
      qc.invalidateQueries({ queryKey: tagKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

export function useBulkTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadIds,
      tagId,
    }: {
      threadIds: string[];
      tagId: string;
    }) => bulkTag(threadIds, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}
