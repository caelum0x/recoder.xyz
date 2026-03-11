import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createTemplate,
  getTemplates,
  getTemplateDetail,
  useTemplateApi,
  updateTemplate,
  deleteTemplate,
  createTemplateFromAgent,
  getTemplateCategories,
  type CreateTemplateData,
  type UpdateTemplateData,
  type TemplateFilters,
} from '@/lib/api/agent-template-gallery';

const TEMPLATES_KEY = ['agent-templates'] as const;
const CATEGORIES_KEY = ['agent-template-categories'] as const;

export function useTemplates(filters?: TemplateFilters) {
  return useQuery({
    queryKey: [
      ...TEMPLATES_KEY,
      filters?.category ?? 'all',
      filters?.search ?? '',
      filters?.sort_by ?? 'popular',
      filters?.is_featured,
      filters?.is_official,
      filters?.limit,
      filters?.offset,
    ],
    queryFn: () => getTemplates(filters),
    staleTime: 60_000,
  });
}

export function useTemplateDetail(templateId: string | null) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, 'detail', templateId],
    queryFn: () => getTemplateDetail(templateId!),
    enabled: !!templateId,
    staleTime: 60_000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTemplateData) => createTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });
}

export function useUseTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => useTemplateApi(templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      data,
    }: {
      templateId: string;
      data: UpdateTemplateData;
    }) => updateTemplate(templateId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
      qc.invalidateQueries({
        queryKey: [...TEMPLATES_KEY, 'detail', variables.templateId],
      });
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => deleteTemplate(templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });
}

export function useCreateTemplateFromAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      data,
    }: {
      agentId: string;
      data: {
        name: string;
        description: string;
        category: string;
        tags?: string[];
        is_public?: boolean;
      };
    }) => createTemplateFromAgent(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });
}

export function useTemplateCategories() {
  return useQuery({
    queryKey: [...CATEGORIES_KEY],
    queryFn: () => getTemplateCategories(),
    staleTime: 120_000,
  });
}
