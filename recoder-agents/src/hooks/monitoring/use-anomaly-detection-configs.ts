'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createAnomalyConfig,
  getAnomalyConfigs,
  updateAnomalyConfig,
  deleteAnomalyConfig,
  runAnomalyConfigScan,
  getDetectedAnomalies,
  updateDetectedAnomalyStatus,
  getAnomalyDetectionStats,
  type AnomalyDetectionConfig,
  type DetectedAnomaly,
  type AnomalyDetectionStats,
  type AnomalyScanResult,
  type CreateAnomalyConfigData,
  type UpdateAnomalyConfigData,
  type DetectedAnomalyFilters,
} from '@/lib/api/anomaly-detection-configs';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const anomalyConfigKeys = {
  all: ['anomaly-detection-configs'] as const,
  configs: () => [...anomalyConfigKeys.all, 'configs'] as const,
  detected: (filters?: DetectedAnomalyFilters) =>
    [...anomalyConfigKeys.all, 'detected', filters] as const,
  stats: () => [...anomalyConfigKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Config Hooks
// ---------------------------------------------------------------------------

export function useAnomalyConfigs() {
  return useQuery<AnomalyDetectionConfig[]>({
    queryKey: anomalyConfigKeys.configs(),
    queryFn: getAnomalyConfigs,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateAnomalyConfig() {
  const queryClient = useQueryClient();
  return useMutation<AnomalyDetectionConfig, Error, CreateAnomalyConfigData>({
    mutationFn: createAnomalyConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anomalyConfigKeys.configs() });
    },
  });
}

export function useUpdateAnomalyConfig() {
  const queryClient = useQueryClient();
  return useMutation<
    AnomalyDetectionConfig,
    Error,
    { configId: string; data: UpdateAnomalyConfigData }
  >({
    mutationFn: ({ configId, data }) => updateAnomalyConfig(configId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anomalyConfigKeys.configs() });
    },
  });
}

export function useDeleteAnomalyConfig() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteAnomalyConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anomalyConfigKeys.configs() });
    },
  });
}

// ---------------------------------------------------------------------------
// Scan Hook
// ---------------------------------------------------------------------------

export function useRunAnomalyScan() {
  const queryClient = useQueryClient();
  return useMutation<AnomalyScanResult, Error>({
    mutationFn: runAnomalyConfigScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anomalyConfigKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Detected Anomalies Hooks
// ---------------------------------------------------------------------------

export function useDetectedAnomalies(
  filters?: DetectedAnomalyFilters,
  options?: { enabled?: boolean }
) {
  return useQuery<DetectedAnomaly[]>({
    queryKey: anomalyConfigKeys.detected(filters),
    queryFn: () => getDetectedAnomalies(filters),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

export function useUpdateAnomalyStatus() {
  const queryClient = useQueryClient();
  return useMutation<DetectedAnomaly, Error, { anomalyId: string; status: string }>({
    mutationFn: ({ anomalyId, status }) => updateDetectedAnomalyStatus(anomalyId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anomalyConfigKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Stats Hook
// ---------------------------------------------------------------------------

export function useAnomalyStats(options?: { enabled?: boolean }) {
  return useQuery<AnomalyDetectionStats>({
    queryKey: anomalyConfigKeys.stats(),
    queryFn: getAnomalyDetectionStats,
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
