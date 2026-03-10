import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createSchedule,
  getAgentSchedules,
  getAllSchedules,
  updateSchedule,
  deleteSchedule,
  triggerSchedule,
  getScheduleExecutions,
  type CreateScheduleData,
  type UpdateScheduleData,
} from '@/lib/api/agent-schedules';

export function useAgentSchedules(agentId: string) {
  return useQuery({
    queryKey: ['agent-schedules', agentId],
    queryFn: () => getAgentSchedules(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useAllSchedules() {
  return useQuery({
    queryKey: ['all-schedules'],
    queryFn: getAllSchedules,
    staleTime: 30_000,
  });
}

export function useCreateSchedule(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateScheduleData) => createSchedule(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-schedules', agentId] });
      qc.invalidateQueries({ queryKey: ['all-schedules'] });
    },
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scheduleId,
      data,
    }: {
      scheduleId: string;
      data: UpdateScheduleData;
    }) => updateSchedule(scheduleId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-schedules'] });
      qc.invalidateQueries({ queryKey: ['all-schedules'] });
    },
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) => deleteSchedule(scheduleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-schedules'] });
      qc.invalidateQueries({ queryKey: ['all-schedules'] });
    },
  });
}

export function useTriggerSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) => triggerSchedule(scheduleId),
    onSuccess: (_data, scheduleId) => {
      qc.invalidateQueries({ queryKey: ['agent-schedules'] });
      qc.invalidateQueries({ queryKey: ['all-schedules'] });
      qc.invalidateQueries({ queryKey: ['schedule-executions', scheduleId] });
    },
  });
}

export function useScheduleExecutions(
  scheduleId: string,
  options?: { limit?: number; offset?: number; status?: string }
) {
  return useQuery({
    queryKey: ['schedule-executions', scheduleId, options],
    queryFn: () => getScheduleExecutions(scheduleId, options),
    enabled: !!scheduleId,
    staleTime: 15_000,
  });
}
