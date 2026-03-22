import { backendApi } from '@/lib/api-client';

export interface ApprovalWorkflow {
  id: string;
  user_id: string;
  workflow_name: string;
  agent_id: string | null;
  trigger_conditions: Record<string, unknown>;
  approvers: string[];
  approval_timeout_hours: number;
  auto_reject_on_timeout: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  workflow_id: string | null;
  user_id: string;
  agent_id: string;
  action_type: string;
  action_data: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ApprovalStats {
  pending_count: number;
  approval_rate: number;
  avg_decision_time_hours: number;
  by_action_type: Record<string, number>;
}

export interface CreateWorkflowData {
  workflow_name: string;
  agent_id?: string;
  trigger_conditions?: Record<string, unknown>;
  approvers?: string[];
  approval_timeout_hours?: number;
  auto_reject_on_timeout?: boolean;
}

export interface UpdateWorkflowData {
  workflow_name?: string;
  agent_id?: string;
  trigger_conditions?: Record<string, unknown>;
  approvers?: string[];
  approval_timeout_hours?: number;
  auto_reject_on_timeout?: boolean;
  is_active?: boolean;
}

export interface CreateRequestData {
  agent_id: string;
  action_type: string;
  action_data?: Record<string, unknown>;
  workflow_id?: string;
}

export interface RequestFilters {
  status?: string;
  agent_id?: string;
  limit?: number;
}

// ── Workflows ──────────────────────────────────────────────────────────────

export const createWorkflow = async (
  data: CreateWorkflowData
): Promise<ApprovalWorkflow> => {
  const response = await backendApi.post<ApprovalWorkflow>(
    '/approval/workflows',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getWorkflows = async (): Promise<ApprovalWorkflow[]> => {
  const response = await backendApi.get<ApprovalWorkflow[]>(
    '/approval/workflows',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateWorkflow = async (
  workflowId: string,
  data: UpdateWorkflowData
): Promise<ApprovalWorkflow> => {
  const response = await backendApi.patch<ApprovalWorkflow>(
    `/approval/workflows/${workflowId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteWorkflow = async (workflowId: string): Promise<void> => {
  const response = await backendApi.delete(
    `/approval/workflows/${workflowId}`
  );
  if (response.error) throw new Error(response.error.message);
};

// ── Requests ───────────────────────────────────────────────────────────────

export const createApprovalRequest = async (
  data: CreateRequestData
): Promise<ApprovalRequest> => {
  const response = await backendApi.post<ApprovalRequest>(
    '/approval/requests',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getApprovalRequests = async (
  filters?: RequestFilters
): Promise<ApprovalRequest[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<ApprovalRequest[]>(
    `/approval/requests${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getApprovalRequest = async (
  requestId: string
): Promise<ApprovalRequest> => {
  const response = await backendApi.get<ApprovalRequest>(
    `/approval/requests/${requestId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const approveRequest = async (
  requestId: string,
  decisionNote?: string
): Promise<ApprovalRequest> => {
  const response = await backendApi.post<ApprovalRequest>(
    `/approval/requests/${requestId}/approve`,
    { decision_note: decisionNote }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const rejectRequest = async (
  requestId: string,
  decisionNote?: string
): Promise<ApprovalRequest> => {
  const response = await backendApi.post<ApprovalRequest>(
    `/approval/requests/${requestId}/reject`,
    { decision_note: decisionNote }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const cancelRequest = async (
  requestId: string
): Promise<ApprovalRequest> => {
  const response = await backendApi.post<ApprovalRequest>(
    `/approval/requests/${requestId}/cancel`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getApprovalStats = async (): Promise<ApprovalStats> => {
  const response = await backendApi.get<ApprovalStats>(
    '/approval/stats',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
