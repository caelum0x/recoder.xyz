import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listResponseTemplates,
  getResponseTemplateStats,
  getResponseTemplate,
  createResponseTemplate,
  updateResponseTemplate,
  deleteResponseTemplate,
  renderResponseTemplate,
  listTemplateRenders,
} from '@/lib/api/response-templates';

export function useResponseTemplates(params?: {
  category?: string;
  output_format?: string;
}) {
  return useQuery({
    queryKey: ['response-templates', params],
    queryFn: () => listResponseTemplates(params),
  });
}

export function useResponseTemplateStats() {
  return useQuery({
    queryKey: ['response-templates', 'stats'],
    queryFn: getResponseTemplateStats,
  });
}

export function useResponseTemplate(id: string) {
  return useQuery({
    queryKey: ['response-templates', id],
    queryFn: () => getResponseTemplate(id),
    enabled: !!id,
  });
}

export function useCreateResponseTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createResponseTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['response-templates'] }),
  });
}

export function useUpdateResponseTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof updateResponseTemplate>[1];
    }) => updateResponseTemplate(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['response-templates'] }),
  });
}

export function useDeleteResponseTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteResponseTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['response-templates'] }),
  });
}

export function useRenderResponseTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof renderResponseTemplate>[1];
    }) => renderResponseTemplate(id, data),
    onSuccess: (_data, { id }) =>
      qc.invalidateQueries({ queryKey: ['response-templates', id, 'renders'] }),
  });
}

export function useTemplateRenders(templateId: string) {
  return useQuery({
    queryKey: ['response-templates', templateId, 'renders'],
    queryFn: () => listTemplateRenders(templateId),
    enabled: !!templateId,
  });
}
