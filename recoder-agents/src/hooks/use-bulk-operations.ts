'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  executeBulkOperation,
  getBulkOperations,
  getBulkOperationDetail,
  previewBulkOperation,
  getBulkOpStats,
  type BulkOperation,
  type BulkExecuteRequest,
  type BulkExecuteResponse,
  type BulkPreviewRequest,
  type BulkPreviewResponse,
  type BulkOpStats,
  type BulkOperationFilters,
} from '@/lib/api/bulk-operations';

// ============================================================================
// Query Keys
// ============================================================================

export const bulkOpKeys = {
  all: ['bulk-operations'] as const,
  list: (filters?: BulkOperationFilters) => [...bulkOpKeys.all, 'list', filters] as const,
  detail: (opId: string) => [...bulkOpKeys.all, 'detail', opId] as const,
  stats: () => [...bulkOpKeys.all, 'stats'] as const,
};

// ============================================================================
// Hooks
// ============================================================================

export function useExecuteBulkOp() {
  const queryClient = useQueryClient();

  return useMutation<BulkExecuteResponse, Error, BulkExecuteRequest>({
    mutationFn: (request) => executeBulkOperation(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bulkOpKeys.all });
      // Also invalidate agents/threads since bulk ops may modify them
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

export function useBulkOperations(filters?: BulkOperationFilters) {
  return useQuery<BulkOperation[]>({
    queryKey: bulkOpKeys.list(filters),
    queryFn: () => getBulkOperations(filters),
    staleTime: 10_000,
  });
}

export function useBulkOperationDetail(opId: string) {
  return useQuery<BulkOperation>({
    queryKey: bulkOpKeys.detail(opId),
    queryFn: () => getBulkOperationDetail(opId),
    enabled: !!opId,
    staleTime: 5_000,
  });
}

export function usePreviewBulkOp() {
  return useMutation<BulkPreviewResponse, Error, BulkPreviewRequest>({
    mutationFn: (request) => previewBulkOperation(request),
  });
}

export function useBulkOpStats() {
  return useQuery<BulkOpStats>({
    queryKey: bulkOpKeys.stats(),
    queryFn: () => getBulkOpStats(),
    staleTime: 30_000,
  });
}
