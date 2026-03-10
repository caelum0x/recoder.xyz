import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listKbRelationships,
  createKbRelationship,
  deleteKbRelationship,
  getKbGraph,
  getRelationshipSuggestions,
  type CreateRelationshipPayload,
} from '@/lib/api/kb-relationships';

export const useKbRelationships = (entryId?: string) => {
  return useQuery({
    queryKey: ['kb-relationships', entryId],
    queryFn: () => listKbRelationships(entryId ? { entry_id: entryId } : undefined),
    staleTime: 2 * 60 * 1000,
  });
};

export const useCreateRelationship = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateRelationshipPayload) => createKbRelationship(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-relationships'] });
      queryClient.invalidateQueries({ queryKey: ['kb-graph'] });
    },
  });
};

export const useDeleteRelationship = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (relationshipId: string) => deleteKbRelationship(relationshipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-relationships'] });
      queryClient.invalidateQueries({ queryKey: ['kb-graph'] });
    },
  });
};

export const useKbGraph = () => {
  return useQuery({
    queryKey: ['kb-graph'],
    queryFn: getKbGraph,
    staleTime: 60 * 1000,
  });
};

export const useRelationshipSuggestions = (entryId: string) => {
  return useQuery({
    queryKey: ['kb-relationship-suggestions', entryId],
    queryFn: () => getRelationshipSuggestions(entryId),
    enabled: !!entryId,
    staleTime: 5 * 60 * 1000,
  });
};
