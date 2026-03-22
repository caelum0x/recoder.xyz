import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listMemoryProfiles,
  createMemoryProfile,
  getMemoryProfile,
  updateMemoryProfile,
  deleteMemoryProfile,
  setMemorySlot,
  listMemorySlots,
  deleteMemorySlot,
  getMemoryAccessLog,
  type CreateProfileData,
  type UpdateProfileData,
  type SetSlotData,
} from '@/lib/api/agent-memory-profiles';

export function useMemoryProfiles(agentId: string) {
  return useQuery({
    queryKey: ['memory-profiles', agentId],
    queryFn: () => listMemoryProfiles(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useCreateMemoryProfile(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProfileData) => createMemoryProfile(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory-profiles', agentId] });
    },
  });
}

export function useUpdateMemoryProfile(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, data }: { profileId: string; data: UpdateProfileData }) =>
      updateMemoryProfile(agentId, profileId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['memory-profiles', agentId] });
      qc.invalidateQueries({ queryKey: ['memory-profile', agentId, variables.profileId] });
    },
  });
}

export function useDeleteMemoryProfile(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => deleteMemoryProfile(agentId, profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory-profiles', agentId] });
    },
  });
}

export function useMemorySlots(profileId: string) {
  return useQuery({
    queryKey: ['memory-slots', profileId],
    queryFn: () => listMemorySlots(profileId),
    enabled: !!profileId,
    staleTime: 30_000,
  });
}

export function useSetMemorySlot(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SetSlotData) => setMemorySlot(profileId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory-slots', profileId] });
      qc.invalidateQueries({ queryKey: ['memory-access-log', profileId] });
    },
  });
}

export function useDeleteMemorySlot(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotKey: string) => deleteMemorySlot(profileId, slotKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory-slots', profileId] });
      qc.invalidateQueries({ queryKey: ['memory-access-log', profileId] });
    },
  });
}

export function useMemoryAccessLog(profileId: string, limit: number = 50) {
  return useQuery({
    queryKey: ['memory-access-log', profileId, limit],
    queryFn: () => getMemoryAccessLog(profileId, limit),
    enabled: !!profileId,
    staleTime: 15_000,
  });
}
