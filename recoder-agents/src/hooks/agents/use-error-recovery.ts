import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPlaybooks,
  getPlaybookStats,
  getPlaybook,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  executePlaybook,
  listPlaybookExecutions,
} from '@/lib/api/error-recovery';

export function usePlaybooks(params?: { error_type?: string }) {
  return useQuery({
    queryKey: ['error-recovery', 'playbooks', params],
    queryFn: () => listPlaybooks(params),
  });
}

export function usePlaybookStats() {
  return useQuery({
    queryKey: ['error-recovery', 'stats'],
    queryFn: getPlaybookStats,
  });
}

export function usePlaybook(id: string) {
  return useQuery({
    queryKey: ['error-recovery', 'playbook', id],
    queryFn: () => getPlaybook(id),
    enabled: !!id,
  });
}

export function useCreatePlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPlaybook,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['error-recovery'] }),
  });
}

export function useUpdatePlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof updatePlaybook>[1];
    }) => updatePlaybook(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['error-recovery'] }),
  });
}

export function useDeletePlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePlaybook,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['error-recovery'] }),
  });
}

export function useExecutePlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data?: Parameters<typeof executePlaybook>[1];
    }) => executePlaybook(id, data),
    onSuccess: (_data, { id }) =>
      qc.invalidateQueries({
        queryKey: ['error-recovery', 'playbook', id, 'executions'],
      }),
  });
}

export function usePlaybookExecutions(playbookId: string) {
  return useQuery({
    queryKey: ['error-recovery', 'playbook', playbookId, 'executions'],
    queryFn: () => listPlaybookExecutions(playbookId),
    enabled: !!playbookId,
  });
}
