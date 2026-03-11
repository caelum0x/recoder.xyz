import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createWorkflow,
  getWorkflows,
  updateWorkflow,
  deleteWorkflow,
  createApprovalRequest,
  getApprovalRequests,
  getApprovalRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  getApprovalStats,
  type CreateWorkflowData,
  type UpdateWorkflowData,
  type CreateRequestData,
  type RequestFilters,
} from '@/lib/api/approval-workflows';

// ── Workflow hooks ─────────────────────────────────────────────────────────

export function useApprovalWorkflows() {
  return useQuery({
    queryKey: ['approval-workflows'],
    queryFn: getWorkflows,
    staleTime: 30_000,
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWorkflowData) => createWorkflow(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-workflows'] });
    },
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      data,
    }: {
      workflowId: string;
      data: UpdateWorkflowData;
    }) => updateWorkflow(workflowId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-workflows'] });
    },
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => deleteWorkflow(workflowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-workflows'] });
    },
  });
}

// ── Request hooks ──────────────────────────────────────────────────────────

export function useApprovalRequests(filters?: RequestFilters) {
  return useQuery({
    queryKey: ['approval-requests', filters],
    queryFn: () => getApprovalRequests(filters),
    staleTime: 15_000,
  });
}

export function useApprovalRequest(requestId: string) {
  return useQuery({
    queryKey: ['approval-request', requestId],
    queryFn: () => getApprovalRequest(requestId),
    enabled: !!requestId,
    staleTime: 15_000,
  });
}

export function useCreateApprovalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRequestData) => createApprovalRequest(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['approval-stats'] });
    },
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      decisionNote,
    }: {
      requestId: string;
      decisionNote?: string;
    }) => approveRequest(requestId, decisionNote),
    onSuccess: (_data, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['approval-request', requestId] });
      qc.invalidateQueries({ queryKey: ['approval-stats'] });
    },
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      decisionNote,
    }: {
      requestId: string;
      decisionNote?: string;
    }) => rejectRequest(requestId, decisionNote),
    onSuccess: (_data, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['approval-request', requestId] });
      qc.invalidateQueries({ queryKey: ['approval-stats'] });
    },
  });
}

export function useCancelRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelRequest(requestId),
    onSuccess: (_data, requestId) => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['approval-request', requestId] });
      qc.invalidateQueries({ queryKey: ['approval-stats'] });
    },
  });
}

export function useApprovalStats() {
  return useQuery({
    queryKey: ['approval-stats'],
    queryFn: getApprovalStats,
    staleTime: 30_000,
  });
}
