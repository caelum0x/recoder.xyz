import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTeams,
  createTeam,
  getTeamDetail,
  updateTeam,
  deleteTeam,
  inviteMember,
  removeMember,
  updateMemberRole,
} from '@/lib/api/teams';

export function useTeams() {
  return useQuery({ queryKey: ['teams'], queryFn: getTeams, staleTime: 60_000 });
}

export function useTeamDetail(teamId: string) {
  return useQuery({
    queryKey: ['team', teamId],
    queryFn: () => getTeamDetail(teamId),
    enabled: !!teamId,
    staleTime: 30_000,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTeam,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, ...data }: { teamId: string; name?: string; description?: string }) =>
      updateTeam(teamId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTeam,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, email, role }: { teamId: string; email: string; role?: string }) =>
      inviteMember(teamId, email, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      removeMember(teamId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, userId, role }: { teamId: string; userId: string; role: string }) =>
      updateMemberRole(teamId, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
}
