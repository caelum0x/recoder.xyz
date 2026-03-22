import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  addAgentToWorkspace,
  removeAgentFromWorkspace,
  addThreadToWorkspace,
  removeThreadFromWorkspace,
  recordWorkspaceActivity,
  listWorkspaceActivity,
} from '@/lib/api/workspace-management';

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: ['workspaces', id],
    queryFn: () => getWorkspace(id),
    enabled: !!id,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof updateWorkspace>[1];
    }) => updateWorkspace(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useAddAgentToWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      agentId,
    }: {
      workspaceId: string;
      agentId: string;
    }) => addAgentToWorkspace(workspaceId, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useRemoveAgentFromWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      agentId,
    }: {
      workspaceId: string;
      agentId: string;
    }) => removeAgentFromWorkspace(workspaceId, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useAddThreadToWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      threadId,
    }: {
      workspaceId: string;
      threadId: string;
    }) => addThreadToWorkspace(workspaceId, threadId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useRemoveThreadFromWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      threadId,
    }: {
      workspaceId: string;
      threadId: string;
    }) => removeThreadFromWorkspace(workspaceId, threadId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useWorkspaceActivity(workspaceId: string) {
  return useQuery({
    queryKey: ['workspaces', workspaceId, 'activity'],
    queryFn: () => listWorkspaceActivity(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useRecordWorkspaceActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      data,
    }: {
      workspaceId: string;
      data: Parameters<typeof recordWorkspaceActivity>[1];
    }) => recordWorkspaceActivity(workspaceId, data),
    onSuccess: (_data, { workspaceId }) =>
      qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'activity'] }),
  });
}
