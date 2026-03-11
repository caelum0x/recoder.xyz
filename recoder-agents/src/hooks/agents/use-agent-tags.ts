import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  getAgentTags,
  createAgentTag,
  updateAgentTag,
  deleteAgentTag,
  getAgentTagsForAgent,
  assignAgentTag,
  removeAgentTag,
  getTagAgents,
  type AgentTag,
  type CreateTagData,
  type UpdateTagData,
  type TagAssignment,
} from '@/lib/api/agent-tags';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const agentTagKeys = {
  all: ['agent-tags'] as const,
  lists: () => [...agentTagKeys.all, 'list'] as const,
  agentTags: (agentId: string) =>
    [...agentTagKeys.all, 'agent', agentId] as const,
  tagAgents: (tagId: string) =>
    [...agentTagKeys.all, 'tag-agents', tagId] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Fetch all tags for the current user (with agent counts). */
export function useTags() {
  return useQuery<AgentTag[]>({
    queryKey: agentTagKeys.lists(),
    queryFn: getAgentTags,
    staleTime: 15000,
    refetchOnMount: 'always',
  });
}

/** Create a new tag. */
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation<AgentTag, Error, CreateTagData>({
    mutationFn: (data) => createAgentTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentTagKeys.lists() });
      toast.success('Tag created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create tag');
    },
  });
}

/** Update a tag. */
export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation<
    AgentTag,
    Error,
    { tagId: string; data: UpdateTagData }
  >({
    mutationFn: ({ tagId, data }) => updateAgentTag(tagId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentTagKeys.lists() });
      toast.success('Tag updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update tag');
    },
  });
}

/** Delete a tag. */
export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation<any, Error, string>({
    mutationFn: (tagId) => deleteAgentTag(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentTagKeys.all });
      toast.success('Tag deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete tag');
    },
  });
}

/** Fetch tags for a specific agent. */
export function useAgentTags(agentId: string) {
  return useQuery<AgentTag[]>({
    queryKey: agentTagKeys.agentTags(agentId),
    queryFn: () => getAgentTagsForAgent(agentId),
    enabled: !!agentId,
    staleTime: 15000,
    refetchOnMount: 'always',
  });
}

/** Assign a tag to an agent. */
export function useAssignTag() {
  const queryClient = useQueryClient();

  return useMutation<any, Error, { agentId: string; tagId: string }>({
    mutationFn: ({ agentId, tagId }) => assignAgentTag(agentId, tagId),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentTagKeys.agentTags(agentId) });
      queryClient.invalidateQueries({ queryKey: agentTagKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign tag');
    },
  });
}

/** Remove a tag from an agent. */
export function useRemoveTag() {
  const queryClient = useQueryClient();

  return useMutation<any, Error, { agentId: string; tagId: string }>({
    mutationFn: ({ agentId, tagId }) => removeAgentTag(agentId, tagId),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentTagKeys.agentTags(agentId) });
      queryClient.invalidateQueries({ queryKey: agentTagKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove tag');
    },
  });
}

/** Fetch agent IDs for a specific tag. */
export function useTagAgents(tagId: string) {
  return useQuery<TagAssignment[]>({
    queryKey: agentTagKeys.tagAgents(tagId),
    queryFn: () => getTagAgents(tagId),
    enabled: !!tagId,
    staleTime: 15000,
    refetchOnMount: 'always',
  });
}

export type { AgentTag, CreateTagData, UpdateTagData, TagAssignment };
