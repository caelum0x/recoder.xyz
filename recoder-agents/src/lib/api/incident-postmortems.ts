import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface Postmortem {
  id: string;
  user_id: string;
  incident_id?: string | null;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'in_review' | 'published' | 'archived';
  summary?: string | null;
  timeline?: Array<{ timestamp?: string; description: string }>;
  root_cause?: string | null;
  impact?: string | null;
  action_items?: Array<{ description: string; assignee?: string; status?: string; due_date?: string }>;
  lessons_learned?: string[];
  affected_agents?: string[];
  started_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePostmortemData {
  title: string;
  incident_id?: string;
  severity?: string;
  summary?: string;
  root_cause?: string;
  impact?: string;
  action_items?: Array<{ description: string; assignee?: string; status?: string; due_date?: string }>;
  lessons_learned?: string[];
  affected_agents?: string[];
  started_at?: string;
  resolved_at?: string;
}

export interface UpdatePostmortemData {
  title?: string;
  incident_id?: string;
  severity?: string;
  status?: string;
  summary?: string;
  timeline?: Array<{ timestamp?: string; description: string }>;
  root_cause?: string;
  impact?: string;
  action_items?: Array<{ description: string; assignee?: string; status?: string; due_date?: string }>;
  lessons_learned?: string[];
  affected_agents?: string[];
  started_at?: string;
  resolved_at?: string;
}

export interface PostmortemStats {
  total: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  avg_resolution_hours: number | null;
}

export interface PostmortemFilters {
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const getPostmortems = async (filters?: PostmortemFilters): Promise<Postmortem[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const query = params.toString();
  const url = `/postmortems${query ? `?${query}` : ''}`;

  const response = await backendApi.get<Postmortem[]>(url, {
    showErrors: true,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch postmortems: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const getPostmortem = async (id: string): Promise<Postmortem> => {
  const response = await backendApi.get<Postmortem>(
    `/postmortems/${id}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch postmortem: ${response.error.message}`);
  }

  return response.data!;
};

export const createPostmortem = async (data: CreatePostmortemData): Promise<Postmortem> => {
  const response = await backendApi.post<Postmortem>(
    '/postmortems',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create postmortem: ${response.error.message}`);
  }

  return response.data!;
};

export const updatePostmortem = async (
  id: string,
  data: UpdatePostmortemData
): Promise<Postmortem> => {
  const response = await backendApi.patch<Postmortem>(
    `/postmortems/${id}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update postmortem: ${response.error.message}`);
  }

  return response.data!;
};

export const deletePostmortem = async (id: string): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete<{ deleted: boolean }>(
    `/postmortems/${id}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete postmortem: ${response.error.message}`);
  }

  return response.data!;
};

export const publishPostmortem = async (id: string): Promise<Postmortem> => {
  const response = await backendApi.post<Postmortem>(
    `/postmortems/${id}/publish`,
    undefined,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to publish postmortem: ${response.error.message}`);
  }

  return response.data!;
};

export const getPostmortemStats = async (): Promise<PostmortemStats> => {
  const response = await backendApi.get<PostmortemStats>(
    '/postmortems/stats',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch postmortem stats: ${response.error.message}`);
  }

  return response.data!;
};
