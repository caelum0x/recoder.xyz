import { backendApi } from '@/lib/api-client';
import { handleApiError } from '@/lib/error-handler';

// ============================================================================
// Types
// ============================================================================

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  icon_name: string | null;
  icon_color: string;
  icon_background: string;
  author_id: string;
  author_name: string;
  is_public: boolean;
  is_featured: boolean;
  is_official: boolean;
  usage_count: number;
  rating: number;
  rating_count: number;
  agent_config: Record<string, unknown>;
  tools: string[];
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateUsageLog {
  id: string;
  template_id: string;
  user_id: string;
  agent_id: string;
  created_at: string;
}

export interface CreateTemplateData {
  name: string;
  description: string;
  category: string;
  tags?: string[];
  icon_name?: string | null;
  icon_color?: string;
  icon_background?: string;
  is_public?: boolean;
  agent_config: Record<string, unknown>;
  tools?: string[];
  model?: string | null;
}

export interface UpdateTemplateData {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  icon_name?: string | null;
  icon_color?: string;
  icon_background?: string;
  is_public?: boolean;
  is_featured?: boolean;
  agent_config?: Record<string, unknown>;
  tools?: string[];
  model?: string | null;
}

export interface TemplateFilters {
  category?: string;
  search?: string;
  tags?: string[];
  is_public?: boolean;
  is_featured?: boolean;
  is_official?: boolean;
  sort_by?: 'popular' | 'newest' | 'rating';
  limit?: number;
  offset?: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function createTemplate(
  data: CreateTemplateData,
): Promise<AgentTemplate> {
  try {
    const response = await backendApi.post<AgentTemplate>(
      '/templates',
      data,
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'create template', resource: 'agent-template-gallery' });
    throw error;
  }
}

export async function getTemplates(
  filters?: TemplateFilters,
): Promise<AgentTemplate[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.tags && filters.tags.length > 0) params.set('tags', filters.tags.join(','));
    if (filters?.is_public != null) params.set('is_public', String(filters.is_public));
    if (filters?.is_featured != null) params.set('is_featured', String(filters.is_featured));
    if (filters?.is_official != null) params.set('is_official', String(filters.is_official));
    if (filters?.sort_by) params.set('sort_by', filters.sort_by);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    const qs = params.toString();

    const response = await backendApi.get<AgentTemplate[]>(
      `/templates${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list templates', resource: 'agent-template-gallery' });
    throw error;
  }
}

export async function getTemplateDetail(
  templateId: string,
): Promise<AgentTemplate> {
  try {
    const response = await backendApi.get<AgentTemplate>(
      `/templates/${templateId}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get template detail', resource: 'agent-template-gallery' });
    throw error;
  }
}

export async function useTemplateApi(
  templateId: string,
): Promise<TemplateUsageLog> {
  try {
    const response = await backendApi.post<TemplateUsageLog>(
      `/templates/${templateId}/use`,
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'use template', resource: 'agent-template-gallery' });
    throw error;
  }
}

export async function updateTemplate(
  templateId: string,
  data: UpdateTemplateData,
): Promise<AgentTemplate> {
  try {
    const response = await backendApi.patch<AgentTemplate>(
      `/templates/${templateId}`,
      data,
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'update template', resource: 'agent-template-gallery' });
    throw error;
  }
}

export async function deleteTemplate(
  templateId: string,
): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/templates/${templateId}`,
    );
    if (response.error) throw new Error(response.error.message);
  } catch (error) {
    handleApiError(error, { operation: 'delete template', resource: 'agent-template-gallery' });
    throw error;
  }
}

export async function createTemplateFromAgent(
  agentId: string,
  data: { name: string; description: string; category: string; tags?: string[]; is_public?: boolean },
): Promise<AgentTemplate> {
  try {
    const response = await backendApi.post<AgentTemplate>(
      `/agents/${agentId}/create-template`,
      data,
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'create template from agent', resource: 'agent-template-gallery' });
    throw error;
  }
}

export async function getTemplateCategories(): Promise<CategoryCount[]> {
  try {
    const response = await backendApi.get<CategoryCount[]>(
      '/templates/categories',
      { showErrors: true },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get template categories', resource: 'agent-template-gallery' });
    throw error;
  }
}
