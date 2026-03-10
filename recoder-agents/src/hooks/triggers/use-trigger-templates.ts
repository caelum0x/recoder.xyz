import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTriggerTemplates,
  getTriggerTemplate,
  createTriggerTemplate,
  applyTriggerTemplate,
  seedTriggerTemplates,
  type TriggerTemplate,
  type TriggerTemplateCreatePayload,
  type TriggerTemplateApplyPayload,
} from '@/lib/api/trigger-templates';

export const useTriggerTemplates = (filters?: { category?: string; trigger_type?: string }) => {
  return useQuery({
    queryKey: ['trigger-templates', filters],
    queryFn: () => listTriggerTemplates(filters),
    staleTime: 5 * 60 * 1000,
  });
};

export const useTriggerTemplate = (templateId: string) => {
  return useQuery({
    queryKey: ['trigger-template', templateId],
    queryFn: () => getTriggerTemplate(templateId),
    enabled: !!templateId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TriggerTemplateCreatePayload) => createTriggerTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trigger-templates'] });
    },
  });
};

export const useApplyTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      payload,
    }: {
      templateId: string;
      payload: TriggerTemplateApplyPayload;
    }) => applyTriggerTemplate(templateId, payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['trigger-templates'] });
      queryClient.invalidateQueries({ queryKey: ['agent-triggers'] });
      queryClient.invalidateQueries({ queryKey: ['all-triggers'] });
      queryClient.invalidateQueries({ queryKey: ['agent-upcoming-runs'] });
    },
  });
};

export const useSeedTemplates = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: seedTriggerTemplates,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trigger-templates'] });
    },
  });
};
