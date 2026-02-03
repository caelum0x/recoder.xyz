/**
 * useFeatureFlag Hook
 * React hook to check feature flags with reactive updates.
 *
 * Features:
 * 1. Check if feature flag is enabled
 * 2. Subscribe to flag changes
 * 3. Support fallback values
 * 4. Access flag metadata
 */

import { useStore } from '@nanostores/react';
import { useMemo, useCallback, useEffect } from 'react';
import {
  type FeatureFlagName,
  FEATURE_FLAGS,
} from '~/lib/services/feature-flags';
import {
  featureFlagStates,
  flagMetadata,
  featureFlagsInitialized,
  featureFlagsLoading,
  setFeatureFlagOverride,
  removeFeatureFlagOverride,
  clearAllOverrides,
  setFeatureFlagUserId,
  initializeFeatureFlags,
  experimentalWorkflowsEnabled,
  multiProviderAiEnabled,
  contextCondensationEnabled,
  editIntentAnalyzerEnabled,
  buildValidatorEnabled,
  mcpIntegrationEnabled,
  mobilePreviewEnabled,
  fileBatchingEnabled,
  checkpointsEnabled,
  type FlagMetadata,
} from '~/lib/stores/feature-flags';

/**
 * Hook to check if a single feature flag is enabled
 * Subscribes to changes and re-renders when the flag state changes
 *
 * @param flagName - The name of the feature flag to check
 * @param fallback - Optional fallback value if the flag is not found
 * @returns Whether the feature flag is enabled
 *
 * @example
 * ```tsx
 * const isMobilePreviewEnabled = useFeatureFlag('MOBILE_PREVIEW');
 *
 * if (isMobilePreviewEnabled) {
 *   return <MobilePreview />;
 * }
 * ```
 */
export function useFeatureFlag(flagName: FeatureFlagName, fallback: boolean = false): boolean {
  const flags = useStore(featureFlagStates);
  const initialized = useStore(featureFlagsInitialized);

  if (!initialized) {
    return fallback;
  }

  return flags[flagName] ?? fallback;
}

/**
 * Hook to get the state of multiple feature flags at once
 *
 * @param flagNames - Array of feature flag names to check
 * @returns Object mapping flag names to their enabled state
 *
 * @example
 * ```tsx
 * const flags = useFeatureFlags(['MOBILE_PREVIEW', 'CHECKPOINTS']);
 *
 * if (flags.MOBILE_PREVIEW) {
 *   // ...
 * }
 * ```
 */
export function useFeatureFlags<T extends FeatureFlagName>(
  flagNames: T[]
): Record<T, boolean> {
  const allFlags = useStore(featureFlagStates);
  const initialized = useStore(featureFlagsInitialized);

  return useMemo(() => {
    const result: Partial<Record<T, boolean>> = {};

    for (const name of flagNames) {
      result[name] = initialized ? (allFlags[name] ?? false) : false;
    }

    return result as Record<T, boolean>;
  }, [allFlags, flagNames, initialized]);
}

/**
 * Hook to get all feature flags
 *
 * @returns Object with all feature flag states
 */
export function useAllFeatureFlags(): Record<FeatureFlagName, boolean> {
  return useStore(featureFlagStates);
}

/**
 * Hook to get feature flag metadata (config, override status, etc.)
 *
 * @param flagName - The name of the feature flag
 * @returns Metadata for the flag including config and override status
 *
 * @example
 * ```tsx
 * const { config, isOverridden, overrideSource } = useFeatureFlagMetadata('MOBILE_PREVIEW');
 *
 * return (
 *   <div>
 *     <p>{config.description}</p>
 *     {isOverridden && <span>Overridden via {overrideSource}</span>}
 *   </div>
 * );
 * ```
 */
export function useFeatureFlagMetadata(flagName: FeatureFlagName): FlagMetadata | null {
  const metadata = useStore(flagMetadata);
  return metadata[flagName] ?? null;
}

/**
 * Hook to get metadata for all feature flags
 */
export function useAllFeatureFlagMetadata(): Record<FeatureFlagName, FlagMetadata> {
  return useStore(flagMetadata);
}

/**
 * Hook for managing feature flag overrides
 *
 * @returns Object with methods to manage overrides
 *
 * @example
 * ```tsx
 * const { setOverride, removeOverride, clearAll } = useFeatureFlagOverrides();
 *
 * // Enable a feature for testing
 * setOverride('CHECKPOINTS', true);
 *
 * // Reset to default
 * removeOverride('CHECKPOINTS');
 *
 * // Clear all overrides
 * clearAll();
 * ```
 */
export function useFeatureFlagOverrides() {
  const setOverride = useCallback(
    (flagName: FeatureFlagName, enabled: boolean) => {
      setFeatureFlagOverride(flagName, enabled);
    },
    []
  );

  const removeOverride = useCallback((flagName: FeatureFlagName) => {
    removeFeatureFlagOverride(flagName);
  }, []);

  const clearAll = useCallback(() => {
    clearAllOverrides();
  }, []);

  return {
    setOverride,
    removeOverride,
    clearAll,
  };
}

/**
 * Hook to initialize feature flags with a user ID
 * Typically called once at the app root when user authentication is resolved
 *
 * @param userId - The current user's ID (or null if not authenticated)
 *
 * @example
 * ```tsx
 * function App() {
 *   const { user } = useAuth();
 *   useFeatureFlagInit(user?.id ?? null);
 *
 *   return <AppContent />;
 * }
 * ```
 */
export function useFeatureFlagInit(userId: string | null): void {
  const initialized = useStore(featureFlagsInitialized);

  useEffect(() => {
    if (!initialized) {
      initializeFeatureFlags(userId);
    } else {
      // Update user ID if it changes after initialization
      setFeatureFlagUserId(userId);
    }
  }, [userId, initialized]);
}

/**
 * Hook to get feature flag loading state
 *
 * @returns Object with loading and initialized states
 */
export function useFeatureFlagStatus() {
  const loading = useStore(featureFlagsLoading);
  const initialized = useStore(featureFlagsInitialized);

  return {
    loading,
    initialized,
    ready: initialized && !loading,
  };
}

// ============================================================
// Convenience hooks for specific feature flags
// These provide direct access to individual flags with proper typing
// ============================================================

/**
 * Hook for EXPERIMENTAL_WORKFLOWS flag
 */
export function useExperimentalWorkflows(): boolean {
  return useStore(experimentalWorkflowsEnabled);
}

/**
 * Hook for MULTI_PROVIDER_AI flag
 */
export function useMultiProviderAi(): boolean {
  return useStore(multiProviderAiEnabled);
}

/**
 * Hook for CONTEXT_CONDENSATION flag
 */
export function useContextCondensation(): boolean {
  return useStore(contextCondensationEnabled);
}

/**
 * Hook for EDIT_INTENT_ANALYZER flag
 */
export function useEditIntentAnalyzerFlag(): boolean {
  return useStore(editIntentAnalyzerEnabled);
}

/**
 * Hook for BUILD_VALIDATOR flag
 */
export function useBuildValidator(): boolean {
  return useStore(buildValidatorEnabled);
}

/**
 * Hook for MCP_INTEGRATION flag
 */
export function useMcpIntegration(): boolean {
  return useStore(mcpIntegrationEnabled);
}

/**
 * Hook for MOBILE_PREVIEW flag
 */
export function useMobilePreview(): boolean {
  return useStore(mobilePreviewEnabled);
}

/**
 * Hook for FILE_BATCHING flag
 */
export function useFileBatching(): boolean {
  return useStore(fileBatchingEnabled);
}

/**
 * Hook for CHECKPOINTS flag
 */
export function useCheckpointsEnabled(): boolean {
  return useStore(checkpointsEnabled);
}

// Re-export FEATURE_FLAGS for convenience
export { FEATURE_FLAGS };
