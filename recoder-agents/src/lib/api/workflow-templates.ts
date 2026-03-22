import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  agent_id: string;
  instruction: string;
  order: number;
}

export interface WorkflowVariable {
  name: string;
  label?: string;
  type?: string;
  default_value?: string;
}

export interface WorkflowTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string;
  steps: WorkflowStep[];
  variables: WorkflowVariable[];
  is_public: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateRun {
  id: string;
  template_id: string;
  user_id: string;
  variable_values: Record<string, string>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_step: number;
  results: unknown[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CreateWorkflowTemplateData {
  name: string;
  description?: string;
  category?: string;
  steps: WorkflowStep[];
  variables?: WorkflowVariable[];
  is_public?: boolean;
}

export interface UpdateWorkflowTemplateData {
  name?: string;
  description?: string;
  category?: string;
  steps?: WorkflowStep[];
  variables?: WorkflowVariable[];
  is_public?: boolean;
}

export interface WorkflowTemplateFilters {
  category?: string;
  search?: string;
  public_only?: boolean;
  limit?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getWorkflowTemplates = async (
  filters?: WorkflowTemplateFilters
): Promise<WorkflowTemplate[]> => {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.public_only) params.set('public_only', 'true');
  if (filters?.limit) params.set('limit', String(filters.limit));

  const qs = params.toString();
  const url = `/workflows/templates${qs ? `?${qs}` : ''}`;
  const response = await backendApi.get<WorkflowTemplate[]>(url, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getWorkflowTemplate = async (
  templateId: string
): Promise<WorkflowTemplate> => {
  const response = await backendApi.get<WorkflowTemplate>(
    `/workflows/templates/${templateId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createWorkflowTemplate = async (
  data: CreateWorkflowTemplateData
): Promise<WorkflowTemplate> => {
  const response = await backendApi.post<WorkflowTemplate>(
    '/workflows/templates',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateWorkflowTemplate = async (
  templateId: string,
  data: UpdateWorkflowTemplateData
): Promise<WorkflowTemplate> => {
  const response = await backendApi.patch<WorkflowTemplate>(
    `/workflows/templates/${templateId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteWorkflowTemplate = async (templateId: string) => {
  const response = await backendApi.delete(`/workflows/templates/${templateId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const runWorkflowTemplate = async (
  templateId: string,
  variableValues?: Record<string, string>
): Promise<WorkflowTemplateRun> => {
  const response = await backendApi.post<WorkflowTemplateRun>(
    `/workflows/templates/${templateId}/run`,
    { variable_values: variableValues || {} }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getWorkflowTemplateRuns = async (
  templateId: string
): Promise<WorkflowTemplateRun[]> => {
  const response = await backendApi.get<WorkflowTemplateRun[]>(
    `/workflows/templates/${templateId}/runs`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
