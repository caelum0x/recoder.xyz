/**
 * useFeatureFlags Hook
 * React hooks for accessing workflow feature flags
 */

import { useStore } from '@nanostores/react';
import { useCallback, useEffect } from 'react';
import {
  $effectiveWorkflowFeatureFlags,
  $workflowFeatureFlagsInitialized,
  $workflowFeatureFlagOverrides,
  $workflowFeatureFlagsLoading,
  $streamingEnabled,
  $parallelGenerationEnabled,
  $retryOnFailureEnabled,
  $batchProcessingEnabled,
  $messageQueueEnabled,
  $taskPollingEnabled,
  $taskStreamingEnabled,
  $autoResumeEnabled,
  $progressIndicatorEnabled,
  $detailedErrorsEnabled,
  $generationHistoryEnabled,
  $aiGatewayEnabled,
  $webSearchActionEnabled,
  $imageGenerationEnabled,
  $dataStoreEnabled,
  $generationFeatureFlags,
  $taskFeatureFlags,
  $uiFeatureFlags,
  $experimentalFeatureFlags,
  type WorkflowFeatureFlagName,
  type WorkflowFeatureFlagValues,
  WORKFLOW_FEATURE_FLAG_CONFIGS,
  initializeWorkflowFeatureFlags,
  setWorkflowFeatureFlagOverride,
  removeWorkflowFeatureFlagOverride,
  clearWorkflowFeatureFlagOverrides,
  getWorkflowFeatureFlag,
  isWorkflowFeatureFlagOverridden,
} from './feature-flags-store';

// ============================================================
// Main Hooks
// ============================================================

/**
 * Hook to access all workflow feature flags
 *
 * @example
 * ```tsx
 * const flags = useWorkflowFeatureFlags();
 *
 * if (flags.streaming) {
 *   // Use streaming mode
 * }
 * ```
 */
export function useWorkflowFeatureFlags(): WorkflowFeatureFlagValues {
  return useStore($effectiveWorkflowFeatureFlags);
}

/**
 * Hook to check if a single feature flag is enabled
 *
 * @param flagName - The name of the feature flag
 * @param fallback - Optional fallback if flags aren't initialized
 *
 * @example
 * ```tsx
 * const isStreamingEnabled = useWorkflowFeatureFlag('streaming');
 * ```
 */
export function useWorkflowFeatureFlag(
  flagName: WorkflowFeatureFlagName,
  fallback: boolean = false
): boolean {
  const flags = useStore($effectiveWorkflowFeatureFlags);
  const initialized = useStore($workflowFeatureFlagsInitialized);

  if (!initialized) {
    return fallback;
  }

  return flags[flagName] ?? fallback;
}

/**
 * Hook to check multiple feature flags at once
 *
 * @param flagNames - Array of flag names to check
 *
 * @example
 * ```tsx
 * const flags = useWorkflowFeatureFlagsSubset(['streaming', 'parallelGeneration']);
 * ```
 */
export function useWorkflowFeatureFlagsSubset<
  T extends WorkflowFeatureFlagName,
>(flagNames: T[]): Pick<WorkflowFeatureFlagValues, T> {
  const allFlags = useStore($effectiveWorkflowFeatureFlags);
  const initialized = useStore($workflowFeatureFlagsInitialized);

  const result = {} as Pick<WorkflowFeatureFlagValues, T>;

  for (const name of flagNames) {
    result[name] = initialized ? allFlags[name] : false;
  }

  return result;
}

// ============================================================
// Category-based Hooks
// ============================================================

/**
 * Hook for generation-related feature flags
 */
export function useGenerationFeatureFlags() {
  return useStore($generationFeatureFlags);
}

/**
 * Hook for task-related feature flags
 */
export function useTaskFeatureFlags() {
  return useStore($taskFeatureFlags);
}

/**
 * Hook for UI-related feature flags
 */
export function useUIFeatureFlags() {
  return useStore($uiFeatureFlags);
}

/**
 * Hook for experimental feature flags
 */
export function useExperimentalFeatureFlags() {
  return useStore($experimentalFeatureFlags);
}

// ============================================================
// Individual Flag Hooks
// ============================================================

/**
 * Hook for streaming flag
 */
export function useStreamingFlag(): boolean {
  return useStore($streamingEnabled);
}

/**
 * Hook for parallelGeneration flag
 */
export function useParallelGenerationFlag(): boolean {
  return useStore($parallelGenerationEnabled);
}

/**
 * Hook for retryOnFailure flag
 */
export function useRetryOnFailureFlag(): boolean {
  return useStore($retryOnFailureEnabled);
}

/**
 * Hook for batchProcessing flag
 */
export function useBatchProcessingFlag(): boolean {
  return useStore($batchProcessingEnabled);
}

/**
 * Hook for messageQueue flag
 */
export function useMessageQueueFlag(): boolean {
  return useStore($messageQueueEnabled);
}

/**
 * Hook for taskPolling flag
 */
export function useTaskPollingFlag(): boolean {
  return useStore($taskPollingEnabled);
}

/**
 * Hook for taskStreaming flag
 */
export function useTaskStreamingFlag(): boolean {
  return useStore($taskStreamingEnabled);
}

/**
 * Hook for autoResume flag
 */
export function useAutoResumeFlag(): boolean {
  return useStore($autoResumeEnabled);
}

/**
 * Hook for progressIndicator flag
 */
export function useProgressIndicatorFlag(): boolean {
  return useStore($progressIndicatorEnabled);
}

/**
 * Hook for detailedErrors flag
 */
export function useDetailedErrorsFlag(): boolean {
  return useStore($detailedErrorsEnabled);
}

/**
 * Hook for generationHistory flag
 */
export function useGenerationHistoryFlag(): boolean {
  return useStore($generationHistoryEnabled);
}

/**
 * Hook for aiGateway flag
 */
export function useAiGatewayFlag(): boolean {
  return useStore($aiGatewayEnabled);
}

/**
 * Hook for webSearchAction flag
 */
export function useWebSearchActionFlag(): boolean {
  return useStore($webSearchActionEnabled);
}

/**
 * Hook for imageGeneration flag
 */
export function useImageGenerationFlag(): boolean {
  return useStore($imageGenerationEnabled);
}

/**
 * Hook for dataStore flag
 */
export function useDataStoreFlag(): boolean {
  return useStore($dataStoreEnabled);
}

// ============================================================
// Management Hooks
// ============================================================

/**
 * Hook to initialize workflow feature flags
 *
 * @param flags - Initial flag values from server/config
 *
 * @example
 * ```tsx
 * function App() {
 *   useWorkflowFeatureFlagInit({
 *     streaming: true,
 *     parallelGeneration: false,
 *   });
 *
 *   return <AppContent />;
 * }
 * ```
 */
export function useWorkflowFeatureFlagInit(
  flags: Partial<WorkflowFeatureFlagValues>
): void {
  const initialized = useStore($workflowFeatureFlagsInitialized);

  useEffect(() => {
    if (!initialized) {
      initializeWorkflowFeatureFlags(flags);
    }
  }, [flags, initialized]);
}

/**
 * Hook to manage feature flag overrides (for testing/development)
 *
 * @example
 * ```tsx
 * const { setOverride, removeOverride, clearAll, isOverridden } = useWorkflowFeatureFlagOverrides();
 *
 * // Enable streaming for testing
 * setOverride('streaming', true);
 *
 * // Check if overridden
 * if (isOverridden('streaming')) {
 *   console.log('Streaming is overridden');
 * }
 *
 * // Reset
 * removeOverride('streaming');
 * ```
 */
export function useWorkflowFeatureFlagOverrides() {
  const overrides = useStore($workflowFeatureFlagOverrides);

  const setOverride = useCallback(
    (flag: WorkflowFeatureFlagName, value: boolean): void => {
      setWorkflowFeatureFlagOverride(flag, value);
    },
    []
  );

  const removeOverride = useCallback(
    (flag: WorkflowFeatureFlagName): void => {
      removeWorkflowFeatureFlagOverride(flag);
    },
    []
  );

  const clearAll = useCallback((): void => {
    clearWorkflowFeatureFlagOverrides();
  }, []);

  const isOverridden = useCallback(
    (flag: WorkflowFeatureFlagName): boolean => {
      return flag in overrides;
    },
    [overrides]
  );

  return {
    overrides,
    setOverride,
    removeOverride,
    clearAll,
    isOverridden,
  };
}

/**
 * Hook to get feature flag metadata/config
 *
 * @param flagName - The flag to get config for
 *
 * @example
 * ```tsx
 * const config = useWorkflowFeatureFlagConfig('streaming');
 * console.log(config.description);
 * ```
 */
export function useWorkflowFeatureFlagConfig(
  flagName: WorkflowFeatureFlagName
): (typeof WORKFLOW_FEATURE_FLAG_CONFIGS)[WorkflowFeatureFlagName] {
  return WORKFLOW_FEATURE_FLAG_CONFIGS[flagName];
}

/**
 * Hook to get all feature flag configs
 */
export function useAllWorkflowFeatureFlagConfigs() {
  return WORKFLOW_FEATURE_FLAG_CONFIGS;
}

/**
 * Hook to get status of feature flags system
 *
 * @example
 * ```tsx
 * const { initialized, loading, hasOverrides } = useWorkflowFeatureFlagStatus();
 *
 * if (!initialized || loading) {
 *   return <Loading />;
 * }
 * ```
 */
export function useWorkflowFeatureFlagStatus() {
  const initialized = useStore($workflowFeatureFlagsInitialized);
  const loading = useStore($workflowFeatureFlagsLoading);
  const overrides = useStore($workflowFeatureFlagOverrides);

  return {
    initialized,
    loading,
    ready: initialized && !loading,
    hasOverrides: Object.keys(overrides).length > 0,
    overrideCount: Object.keys(overrides).length,
  };
}

// Re-export store functions for direct use
export {
  initializeWorkflowFeatureFlags,
  setWorkflowFeatureFlagOverride,
  removeWorkflowFeatureFlagOverride,
  clearWorkflowFeatureFlagOverrides,
  getWorkflowFeatureFlag,
  isWorkflowFeatureFlagOverridden,
  WORKFLOW_FEATURE_FLAG_CONFIGS,
};

// Re-export types
export type { WorkflowFeatureFlagName, WorkflowFeatureFlagValues };
