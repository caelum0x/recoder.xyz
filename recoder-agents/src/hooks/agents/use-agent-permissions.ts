import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  seedRoles,
  listAgentRoles,
  assignRole,
  removeRoleAssignment,
  getPermissionAudit,
} from '@/lib/api/agent-permissions';

export function useRoles() {
  return useQuery({
    queryKey: ['agent-roles'],
    queryFn: listRoles,
    staleTime: 30_000,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; permissions: string[] }) =>
      createRole(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-roles'] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      roleId,
      ...data
    }: {
      roleId: string;
      name?: string;
      description?: string;
      permissions?: string[];
    }) => updateRole(roleId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-roles'] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-roles'] }),
  });
}

export function useAgentRoles(agentId: string) {
  return useQuery({
    queryKey: ['agent-role-assignments', agentId],
    queryFn: () => listAgentRoles(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useAssignRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      ...data
    }: {
      agentId: string;
      role_id: string;
      expires_at?: string;
    }) => assignRole(agentId, data),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ['agent-role-assignments', variables.agentId] }),
  });
}

export function useRemoveRoleAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, assignmentId }: { agentId: string; assignmentId: string }) =>
      removeRoleAssignment(agentId, assignmentId),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ['agent-role-assignments', variables.agentId] }),
  });
}

export function usePermissionAudit(agentId: string, params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['permission-audit', agentId, params],
    queryFn: () => getPermissionAudit(agentId, params),
    enabled: !!agentId,
    staleTime: 15_000,
  });
}

export function useSeedRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => seedRoles(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-roles'] }),
  });
}
