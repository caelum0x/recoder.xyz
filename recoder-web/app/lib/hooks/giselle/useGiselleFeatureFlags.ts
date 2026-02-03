/**
 * useGiselleFeatureFlags Hook
 * React hooks for accessing Giselle-specific feature flags
 */

import { useStore } from '@nanostores/react';
import { useCallback, useEffect } from 'react';
import {
  $effectiveGiselleFeatureFlags,
  $giselleFeatureFlagsInitialized,
  $giselleFeatureFlagOverrides,
  $webSearchActionEnabled,
  $layoutV3Enabled,
  $stageEnabled,
  $aiGatewayEnabled,
  $streamingEnabled,
  $parallelGenerationEnabled,
  $retryOnFailureEnabled,
  $batchProcessingEnabled,
  type GiselleFeatureFlagName,
  type GiselleFeatureFlagValues,
  GISELLE_FEATURE_FLAG_CONFIGS,
  initializeGiselleFeatureFlags,
  setGiselleFeatureFlagOverride,
  removeGiselleFeatureFlagOverride,
  clearGiselleFeatureFlagOverrides,
  getGiselleFeatureFlag,
  isGiselleFeatureFlagOverridden,
} from './feature-flags-store';

// ============================================================
// Main Hook
// ============================================================

/**
 * Hook to access all Giselle feature flags
 *
 * @example
 * ```tsx
 * const flags = useGiselleFeatureFlags();
 *
 * if (flags.streaming) {
 *   // Use streaming mode
 * }
 * ```
 */
export function useGiselleFeatureFlags(): GiselleFeatureFlagValues {
  return useStore($effectiveGiselleFeatureFlags);
}

/**
 * Hook to check if a single feature flag is enabled
 *
 * @param flagName - The name of the feature flag
 * @param fallback - Optional fallback if flags aren't initialized
 *
 * @example
 * ```tsx
 * const isStreamingEnabled = useGiselleFeatureFlag('streaming');
 * ```
 */
export function useGiselleFeatureFlag(
  flagName: GiselleFeatureFlagName,
  fallback: boolean = false
): boolean {
  const flags = useStore($effectiveGiselleFeatureFlags);
  const initialized = useStore($giselleFeatureFlagsInitialized);

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
 * const flags = useGiselleFeatureFlagsSubset(['streaming', 'parallelGeneration']);
 * ```
 */
export function useGiselleFeatureFlagsSubset<
  T extends GiselleFeatureFlagName,
>(flagNames: T[]): Pick<GiselleFeatureFlagValues, T> {
  const allFlags = useStore($effectiveGiselleFeatureFlags);
  const initialized = useStore($giselleFeatureFlagsInitialized);

  const result = {} as Pick<GiselleFeatureFlagValues, T>;

  for (const name of flagNames) {
    result[name] = initialized ? allFlags[name] : false;
  }

  return result;
}

// ============================================================
// Individual Flag Hooks
// ============================================================

/**
 * Hook for webSearchAction flag
 */
export function useWebSearchActionFlag(): boolean {
  return useStore($webSearchActionEnabled);
}

/**
 * Hook for layoutV3 flag
 */
export function useLayoutV3Flag(): boolean {
  return useStore($layoutV3Enabled);
}

/**
 * Hook for stage flag
 */
export function useStageFlag(): boolean {
  return useStore($stageEnabled);
}

/**
 * Hook for aiGateway flag
 */
export function useAiGatewayFlag(): boolean {
  return useStore($aiGatewayEnabled);
}

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

// ============================================================
// Management Hooks
// ============================================================

/**
 * Hook to initialize Giselle feature flags
 *
 * @param flags - Initial flag values from server/config
 *
 * @example
 * ```tsx
 * function App() {
 *   useGiselleFeatureFlagInit({
 *     streaming: true,
 *     parallelGeneration: false,
 *   });
 *
 *   return <AppContent />;
 * }
 * ```
 */
export function useGiselleFeatureFlagInit(
  flags: Partial<GiselleFeatureFlagValues>
): void {
  const initialized = useStore($giselleFeatureFlagsInitialized);

  useEffect(() => {
    if (!initialized) {
      initializeGiselleFeatureFlags(flags);
    }
  }, [flags, initialized]);
}

/**
 * Hook to manage feature flag overrides (for testing/development)
 *
 * @example
 * ```tsx
 * const { setOverride, removeOverride, clearAll, isOverridden } = useGiselleFeatureFlagOverrides();
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
export function useGiselleFeatureFlagOverrides() {
  const overrides = useStore($giselleFeatureFlagOverrides);

  const setOverride = useCallback(
    (flag: GiselleFeatureFlagName, value: boolean): void => {
      setGiselleFeatureFlagOverride(flag, value);
    },
    []
  );

  const removeOverride = useCallback(
    (flag: GiselleFeatureFlagName): void => {
      removeGiselleFeatureFlagOverride(flag);
    },
    []
  );

  const clearAll = useCallback((): void => {
    clearGiselleFeatureFlagOverrides();
  }, []);

  const isOverridden = useCallback(
    (flag: GiselleFeatureFlagName): boolean => {
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
 * Hook to get feature flag metadata
 *
 * @param flagName - The flag to get metadata for
 *
 * @example
 * ```tsx
 * const config = useGiselleFeatureFlagConfig('streaming');
 * console.log(config.description);
 * ```
 */
export function useGiselleFeatureFlagConfig(
  flagName: GiselleFeatureFlagName
): (typeof GISELLE_FEATURE_FLAG_CONFIGS)[GiselleFeatureFlagName] {
  return GISELLE_FEATURE_FLAG_CONFIGS[flagName];
}

/**
 * Hook to get status of feature flags system
 *
 * @example
 * ```tsx
 * const { initialized, hasOverrides } = useGiselleFeatureFlagStatus();
 *
 * if (!initialized) {
 *   return <Loading />;
 * }
 * ```
 */
export function useGiselleFeatureFlagStatus() {
  const initialized = useStore($giselleFeatureFlagsInitialized);
  const overrides = useStore($giselleFeatureFlagOverrides);

  return {
    initialized,
    hasOverrides: Object.keys(overrides).length > 0,
    overrideCount: Object.keys(overrides).length,
  };
}

// Re-export store functions for direct use
export {
  initializeGiselleFeatureFlags,
  setGiselleFeatureFlagOverride,
  removeGiselleFeatureFlagOverride,
  clearGiselleFeatureFlagOverrides,
  getGiselleFeatureFlag,
  isGiselleFeatureFlagOverridden,
  GISELLE_FEATURE_FLAG_CONFIGS,
};

// Re-export types
export type { GiselleFeatureFlagName, GiselleFeatureFlagValues };
