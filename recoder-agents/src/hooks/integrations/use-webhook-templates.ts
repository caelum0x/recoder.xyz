import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createWebhookTemplate,
  listWebhookTemplates,
  getWebhookTemplate,
  updateWebhookTemplate,
  deleteWebhookTemplate,
  renderWebhookTemplate,
  getTemplateRenders,
  type CreateTemplateData,
  type UpdateTemplateData,
  type RenderTemplateData,
} from '@/lib/api/webhook-templates';

export function useWebhookTemplates(triggerEvent?: string) {
  return useQuery({
    queryKey: ['webhook-templates', triggerEvent],
    queryFn: () => listWebhookTemplates({ trigger_event: triggerEvent }),
    staleTime: 30_000,
  });
}

export function useWebhookTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['webhook-template', templateId],
    queryFn: () => getWebhookTemplate(templateId!),
    enabled: !!templateId,
    staleTime: 30_000,
  });
}

export function useCreateWebhookTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTemplateData) => createWebhookTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhook-templates'] });
    },
  });
}

export function useUpdateWebhookTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      data,
    }: {
      templateId: string;
      data: UpdateTemplateData;
    }) => updateWebhookTemplate(templateId, data),
    onSuccess: (_data, { templateId }) => {
      qc.invalidateQueries({ queryKey: ['webhook-templates'] });
      qc.invalidateQueries({ queryKey: ['webhook-template', templateId] });
    },
  });
}

export function useDeleteWebhookTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => deleteWebhookTemplate(templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhook-templates'] });
    },
  });
}

export function useRenderWebhookTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      data,
    }: {
      templateId: string;
      data: RenderTemplateData;
    }) => renderWebhookTemplate(templateId, data),
    onSuccess: (_result, { templateId }) => {
      qc.invalidateQueries({ queryKey: ['webhook-templates'] });
      qc.invalidateQueries({ queryKey: ['webhook-template', templateId] });
      qc.invalidateQueries({ queryKey: ['webhook-template-renders', templateId] });
    },
  });
}

export function useTemplateRenders(templateId: string | null) {
  return useQuery({
    queryKey: ['webhook-template-renders', templateId],
    queryFn: () => getTemplateRenders(templateId!, 5),
    enabled: !!templateId,
    staleTime: 15_000,
  });
}
