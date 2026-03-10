import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface CostProject {
  id: string;
  name: string;
  description?: string | null;
  budget?: number | null;
  color: string;
  is_active: boolean;
  total_spend: number;
  run_count: number;
  created_at: string;
}

export interface CreateCostProjectRequest {
  name: string;
  description?: string;
  budget?: number;
  color?: string;
}

export interface UpdateCostProjectRequest {
  name?: string;
  description?: string;
  budget?: number;
  color?: string;
  is_active?: boolean;
}

export interface AllocateRunCostRequest {
  run_id: string;
  agent_id?: string;
  project_id: string;
  cost: number;
  tokens_in?: number;
  tokens_out?: number;
  model?: string;
}

export interface CostAllocation {
  id: string;
  run_id: string;
  agent_id?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  project_color?: string | null;
  cost: number;
  tokens_in: number;
  tokens_out: number;
  model?: string | null;
  allocated_at: string;
}

export interface CostAllocationListResponse {
  allocations: CostAllocation[];
  total: number;
}

export interface CostAllocationFilters {
  project_id?: string;
  agent_id?: string;
  days?: number;
  limit?: number;
  offset?: number;
}

export interface ProjectCostReport {
  project_id: string;
  project_name: string;
  project_color: string;
  budget?: number | null;
  total_spend: number;
  budget_used_pct?: number | null;
  run_count: number;
  top_agents: Array<{ agent_id: string; cost: number; runs: number }>;
}

export interface CostReportResponse {
  projects: ProjectCostReport[];
  total_spend: number;
  unallocated_spend: number;
  top_agents: Array<{ agent_id: string; cost: number; runs: number }>;
  days: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const costAllocationApi = {
  async getProjects(): Promise<CostProject[]> {
    const response = await backendApi.get<CostProject[]>('/cost/projects');
    if (response.error) throw response.error;
    return response.data ?? [];
  },

  async createProject(request: CreateCostProjectRequest): Promise<CostProject> {
    const response = await backendApi.post<CostProject>('/cost/projects', request);
    if (response.error) throw response.error;
    return response.data!;
  },

  async updateProject(projectId: string, request: UpdateCostProjectRequest): Promise<CostProject> {
    const response = await backendApi.patch<CostProject>(
      `/cost/projects/${projectId}`,
      request
    );
    if (response.error) throw response.error;
    return response.data!;
  },

  async deleteProject(projectId: string): Promise<void> {
    const response = await backendApi.delete(`/cost/projects/${projectId}`);
    if (response.error) throw response.error;
  },

  async allocateRunCost(request: AllocateRunCostRequest): Promise<{ success: boolean; id: string; run_id: string; project_id: string | null }> {
    const response = await backendApi.post<{ success: boolean; id: string; run_id: string; project_id: string | null }>(
      '/cost/allocate',
      request
    );
    if (response.error) throw response.error;
    return response.data!;
  },

  async getAllocations(filters?: CostAllocationFilters): Promise<CostAllocationListResponse> {
    const params = new URLSearchParams();
    if (filters?.project_id) params.append('project_id', filters.project_id);
    if (filters?.agent_id) params.append('agent_id', filters.agent_id);
    if (filters?.days) params.append('days', String(filters.days));
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    const qs = params.toString();
    const response = await backendApi.get<CostAllocationListResponse>(
      `/cost/allocations${qs ? `?${qs}` : ''}`
    );
    if (response.error) throw response.error;
    return response.data ?? { allocations: [], total: 0 };
  },

  async getReport(days: number = 30): Promise<CostReportResponse> {
    const response = await backendApi.get<CostReportResponse>(`/cost/report?days=${days}`);
    if (response.error) throw response.error;
    return response.data!;
  },
};
