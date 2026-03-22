import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentComment {
  id: string;
  user_id: string;
  agent_id: string;
  parent_id: string | null;
  content: string;
  section: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommentListResponse {
  comments: AgentComment[];
  total: number;
  limit: number;
  offset: number;
}

export interface CommentCountSection {
  total: number;
  unresolved: number;
}

export interface CommentCountResponse {
  by_section: Record<string, CommentCountSection>;
  total: number;
  total_unresolved: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getAgentComments = async (
  agentId: string,
  filters?: { section?: string; resolved?: boolean; limit?: number; offset?: number }
): Promise<CommentListResponse> => {
  const params = new URLSearchParams();
  if (filters?.section && filters.section !== 'all') params.set('section', filters.section);
  if (filters?.resolved !== undefined) params.set('resolved', String(filters.resolved));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<CommentListResponse>(
    `/agents/${agentId}/comments${qs}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch comments: ${response.error.message}`);
  }

  return response.data!;
};

export const createAgentComment = async (
  agentId: string,
  data: { content: string; section?: string; parent_id?: string }
): Promise<AgentComment> => {
  const response = await backendApi.post<AgentComment>(
    `/agents/${agentId}/comments`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create comment: ${response.error.message}`);
  }

  return response.data!;
};

export const updateAgentComment = async (
  agentId: string,
  commentId: string,
  data: { content?: string; is_resolved?: boolean }
): Promise<AgentComment> => {
  const response = await backendApi.patch<AgentComment>(
    `/agents/${agentId}/comments/${commentId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update comment: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteAgentComment = async (
  agentId: string,
  commentId: string
): Promise<{ deleted: boolean; comment_id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; comment_id: string }>(
    `/agents/${agentId}/comments/${commentId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete comment: ${response.error.message}`);
  }

  return response.data!;
};

export const getAgentCommentCounts = async (
  agentId: string
): Promise<CommentCountResponse> => {
  const response = await backendApi.get<CommentCountResponse>(
    `/agents/${agentId}/comments/count`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch comment counts: ${response.error.message}`);
  }

  return response.data!;
};
