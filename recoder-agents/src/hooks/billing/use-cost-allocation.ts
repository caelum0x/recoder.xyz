'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  costAllocationApi,
  type CostProject,
  type CreateCostProjectRequest,
  type UpdateCostProjectRequest,
  type AllocateRunCostRequest,
  type CostAllocationFilters,
  type CostAllocationListResponse,
  type CostReportResponse,
} from '@/lib/api/cost-allocation';

// ============================================================================
// Query Keys
// ============================================================================

export const costAllocationKeys = {
  all: ['cost-allocation'] as const,
  projects: () => [...costAllocationKeys.all, 'projects'] as const,
  allocations: (filters?: CostAllocationFilters) =>
    [...costAllocationKeys.all, 'allocations', filters ?? {}] as const,
  report: (days?: number) => [...costAllocationKeys.all, 'report', { days }] as const,
};

// ============================================================================
// Project Hooks
// ============================================================================

export function useCostProjects() {
  return useQuery<CostProject[]>({
    queryKey: costAllocationKeys.projects(),
    queryFn: () => costAllocationApi.getProjects(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateCostProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateCostProjectRequest) =>
      costAllocationApi.createProject(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costAllocationKeys.projects() });
      toast.success('Cost project created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create cost project');
    },
  });
}

export function useUpdateCostProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, ...request }: UpdateCostProjectRequest & { projectId: string }) =>
      costAllocationApi.updateProject(projectId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costAllocationKeys.projects() });
      queryClient.invalidateQueries({ queryKey: costAllocationKeys.report() });
      toast.success('Cost project updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update cost project');
    },
  });
}

export function useDeleteCostProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => costAllocationApi.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costAllocationKeys.projects() });
      queryClient.invalidateQueries({ queryKey: costAllocationKeys.report() });
      toast.success('Cost project deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete cost project');
    },
  });
}

// ============================================================================
// Allocation Hooks
// ============================================================================

export function useAllocateRunCost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AllocateRunCostRequest) =>
      costAllocationApi.allocateRunCost(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costAllocationKeys.allocations() });
      queryClient.invalidateQueries({ queryKey: costAllocationKeys.projects() });
      queryClient.invalidateQueries({ queryKey: costAllocationKeys.report() });
      toast.success('Run cost allocated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to allocate run cost');
    },
  });
}

export function useCostAllocations(filters?: CostAllocationFilters) {
  return useQuery<CostAllocationListResponse>({
    queryKey: costAllocationKeys.allocations(filters),
    queryFn: () => costAllocationApi.getAllocations(filters),
    staleTime: 1000 * 60 * 2,
  });
}

// ============================================================================
// Report Hook
// ============================================================================

export function useCostReport(days: number = 30) {
  return useQuery<CostReportResponse>({
    queryKey: costAllocationKeys.report(days),
    queryFn: () => costAllocationApi.getReport(days),
    staleTime: 1000 * 60 * 5,
  });
}
