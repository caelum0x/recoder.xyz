import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listCheckpoints,
  createCheckpoint,
  deleteCheckpoint,
  createReplay,
  listReplays,
  getReplay,
  updateReplay,
  deleteReplay,
  type CreateCheckpointData,
  type CreateReplayData,
  type UpdateReplayData,
} from '@/lib/api/thread-replay';

export function useCheckpoints(threadId: string) {
  return useQuery({
    queryKey: ['thread-checkpoints', threadId],
    queryFn: () => listCheckpoints(threadId),
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

export function useCreateCheckpoint(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCheckpointData) => createCheckpoint(threadId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-checkpoints', threadId] });
    },
  });
}

export function useDeleteCheckpoint(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkpointId: string) => deleteCheckpoint(threadId, checkpointId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-checkpoints', threadId] });
    },
  });
}

export function useCreateReplay(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateReplayData) => createReplay(threadId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-replays', threadId] });
    },
  });
}

export function useReplays(threadId: string) {
  return useQuery({
    queryKey: ['thread-replays', threadId],
    queryFn: () => listReplays(threadId),
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

export function useReplayDetail(replayId: string) {
  return useQuery({
    queryKey: ['replay-detail', replayId],
    queryFn: () => getReplay(replayId),
    enabled: !!replayId,
    staleTime: 30_000,
  });
}

export function useUpdateReplay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ replayId, data }: { replayId: string; data: UpdateReplayData }) =>
      updateReplay(replayId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['replay-detail', variables.replayId] });
    },
  });
}

export function useDeleteReplay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (replayId: string) => deleteReplay(replayId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-replays'] });
    },
  });
}
