import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createScheduledTask,
  getScheduledTasks,
  updateScheduledTask,
  deleteScheduledTask,
  triggerScheduledTask,
  getTaskRuns,
  getUpcomingRuns,
  type CreateScheduledTaskData,
  type UpdateScheduledTaskData,
} from '@/lib/api/agent-scheduled-tasks';

export function useScheduledTasks(agentId: string) {
  return useQuery({
    queryKey: ['scheduled-tasks', agentId],
    queryFn: () => getScheduledTasks(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useCreateScheduledTask(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateScheduledTaskData) =>
      createScheduledTask(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-tasks', agentId] });
      qc.invalidateQueries({ queryKey: ['upcoming-runs'] });
    },
  });
}

export function useUpdateScheduledTask(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string;
      data: UpdateScheduledTaskData;
    }) => updateScheduledTask(agentId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-tasks', agentId] });
      qc.invalidateQueries({ queryKey: ['upcoming-runs'] });
    },
  });
}

export function useDeleteScheduledTask(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteScheduledTask(agentId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-tasks', agentId] });
      qc.invalidateQueries({ queryKey: ['upcoming-runs'] });
    },
  });
}

export function useTriggerTask(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => triggerScheduledTask(agentId, taskId),
    onSuccess: (_data, taskId) => {
      qc.invalidateQueries({ queryKey: ['scheduled-tasks', agentId] });
      qc.invalidateQueries({ queryKey: ['task-runs', agentId, taskId] });
      qc.invalidateQueries({ queryKey: ['upcoming-runs'] });
    },
  });
}

export function useTaskRuns(
  agentId: string,
  taskId: string,
  options?: { limit?: number; offset?: number; status?: string }
) {
  return useQuery({
    queryKey: ['task-runs', agentId, taskId, options],
    queryFn: () => getTaskRuns(agentId, taskId, options),
    enabled: !!agentId && !!taskId,
    staleTime: 15_000,
  });
}

export function useUpcomingRuns() {
  return useQuery({
    queryKey: ['upcoming-runs'],
    queryFn: getUpcomingRuns,
    staleTime: 30_000,
  });
}
