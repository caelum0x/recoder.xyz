'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  workflowApi,
  type Workflow,
  type WorkflowDetail,
  type WorkflowExecution,
  type ApprovalGate,
  type CreateWorkflowRequest,
  type AddNodeRequest,
  type AddEdgeRequest,
} from '@/lib/api/workflows';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const workflowKeys = {
  all: ['workflows'] as const,
  list: (agentId: string) => [...workflowKeys.all, 'list', agentId] as const,
  detail: (id: string) => [...workflowKeys.all, 'detail', id] as const,
  executions: (workflowId: string) => [...workflowKeys.all, 'executions', workflowId] as const,
  execution: (executionId: string) => [...workflowKeys.all, 'execution', executionId] as const,
  approvals: ['pending-approvals'] as const,
} as const;

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useWorkflows(agentId: string) {
  return useQuery<Workflow[]>({
    queryKey: workflowKeys.list(agentId),
    queryFn: () => workflowApi.list(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useWorkflow(workflowId: string) {
  return useQuery<WorkflowDetail>({
    queryKey: workflowKeys.detail(workflowId),
    queryFn: () => workflowApi.get(workflowId),
    enabled: !!workflowId,
    staleTime: 15_000,
  });
}

export function useWorkflowExecutions(workflowId: string) {
  return useQuery<WorkflowExecution[]>({
    queryKey: workflowKeys.executions(workflowId),
    queryFn: () => workflowApi.listExecutions(workflowId),
    enabled: !!workflowId,
    refetchInterval: 5_000,
  });
}

export function useWorkflowExecution(executionId: string) {
  return useQuery<WorkflowExecution>({
    queryKey: workflowKeys.execution(executionId),
    queryFn: () => workflowApi.getExecution(executionId),
    enabled: !!executionId,
    refetchInterval: 3_000,
  });
}

export function usePendingApprovals() {
  return useQuery<ApprovalGate[]>({
    queryKey: workflowKeys.approvals,
    queryFn: workflowApi.pendingApprovals,
    refetchInterval: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWorkflowRequest) => workflowApi.create(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: workflowKeys.list(variables.agent_id) });
    },
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

export function useAddNode(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (node: AddNodeRequest) => workflowApi.addNode(workflowId, node),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) });
    },
  });
}

export function useAddEdge(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (edge: AddEdgeRequest) => workflowApi.addEdge(workflowId, edge),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) });
    },
  });
}

export function useDeleteNode(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: string) => workflowApi.deleteNode(nodeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) });
    },
  });
}

export function useDeleteEdge(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (edgeId: string) => workflowApi.deleteEdge(edgeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) });
    },
  });
}

export function useExecuteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      triggerData,
    }: {
      workflowId: string;
      triggerData?: Record<string, unknown>;
    }) => workflowApi.execute(workflowId, triggerData),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: workflowKeys.executions(vars.workflowId) });
    },
  });
}

export function useApproveGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.approvals });
    },
  });
}

export function useRejectGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.reject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.approvals });
    },
  });
}
