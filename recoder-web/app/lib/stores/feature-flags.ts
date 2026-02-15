/**
 * Feature Flags Store
 * Reactive state management for feature flags using nanostores.
 *
 * Features:
 * 1. Store for feature flag states
 * 2. User overrides
 * 3. Flag metadata
 * 4. URL override support for testing
 */

import { atom, map, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import {
  type FeatureFlagName,
  type FeatureFlagConfig,
  type Environment,
  FEATURE_FLAGS,
  DEFAULT_FLAG_CONFIGS,
  getCurrentEnvironment,
  getFeatureFlagState,
  getAllFeatureFlags,
  loadUserOverrides,
  saveUserOverrides,
  clearUserOverrides,
  parseUrlOverrides,
  setFeatureFlag,
  getAllFlagsWithMetadata,
  resetFlagCache,
  isFeatureEnabled,
} from '~/lib/services/feature-flags';

const logger = createScopedLogger('FeatureFlagsStore');

// User ID for percentage rollouts
export const featureFlagUserId = atom<string | null>(null);

// Current environment
export const featureFlagEnvironment = atom<Environment>(getCurrentEnvironment());

// User-specific overrides (persisted to localStorage)
export const featureFlagOverrides = map<Partial<Record<FeatureFlagName, boolean>>>({});

// URL-based overrides (temporary, for testing)
export const featureFlagUrlOverrides = map<Partial<Record<FeatureFlagName, boolean>>>({});

// Loading state
export const featureFlagsLoading = atom<boolean>(true);

// Initialization state
export const featureFlagsInitialized = atom<boolean>(false);

/**
 * Combined overrides (URL overrides take precedence over user overrides)
 */
export const combinedOverrides = computed(
  [featureFlagOverrides, featureFlagUrlOverrides],
  (userOverrides, urlOverrides) => ({
    ...userOverrides,
    ...urlOverrides,
  })
);

/**
 * Computed feature flag states
 * Reactively updates when userId, environment, or overrides change
 */
export const featureFlagStates = computed(
  [featureFlagUserId, featureFlagEnvironment, combinedOverrides],
  (userId, environment, overrides) =>
    getAllFeatureFlags({
      userId,
      environment,
      userOverrides: overrides,
    })
);

/**
 * Individual flag state getters
 */
export const experimentalWorkflowsEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.EXPERIMENTAL_WORKFLOWS]
);

export const multiProviderAiEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.MULTI_PROVIDER_AI]
);

export const contextCondensationEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.CONTEXT_CONDENSATION]
);

export const editIntentAnalyzerEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.EDIT_INTENT_ANALYZER]
);

export const buildValidatorEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.BUILD_VALIDATOR]
);

export const mcpIntegrationEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.MCP_INTEGRATION]
);

export const mobilePreviewEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.MOBILE_PREVIEW]
);

export const fileBatchingEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.FILE_BATCHING]
);

export const checkpointsEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.CHECKPOINTS]
);

// ---- New flag computed stores (giselle-inspired) ----

export const oneShotGenerationEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.ONE_SHOT_GENERATION]
);

export const askModeEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.ASK_MODE]
);

export const contextCompactionEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.CONTEXT_COMPACTION]
);

export const editIntentEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.EDIT_INTENT]
);

export const autoPackageDetectionEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.AUTO_PACKAGE_DETECTION]
);

export const configProtectionEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.CONFIG_PROTECTION]
);

export const compileCheckEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.COMPILE_CHECK]
);

export const contentSecurityEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.CONTENT_SECURITY]
);

export const errorClassificationEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.ERROR_CLASSIFICATION]
);

export const visualEditingEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.VISUAL_EDITING]
);

export const expoSupportEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.EXPO_SUPPORT]
);

export const collaborationEnabled = computed(
  featureFlagStates,
  (flags) => flags[FEATURE_FLAGS.COLLABORATION]
);

/**
 * Flag metadata store
 */
export interface FlagMetadata {
  name: FeatureFlagName;
  config: FeatureFlagConfig;
  isEnabled: boolean;
  isOverridden: boolean;
  overrideSource: 'user' | 'url' | null;
}

export const flagMetadata = computed(
  [featureFlagStates, featureFlagOverrides, featureFlagUrlOverrides],
  (states, userOverrides, urlOverrides) => {
    const metadata: Record<FeatureFlagName, FlagMetadata> = {} as Record<FeatureFlagName, FlagMetadata>;

    for (const flagName of Object.values(FEATURE_FLAGS)) {
      const hasUrlOverride = urlOverrides[flagName] !== undefined;
      const hasUserOverride = userOverrides[flagName] !== undefined;

      metadata[flagName] = {
        name: flagName,
        config: DEFAULT_FLAG_CONFIGS[flagName],
        isEnabled: states[flagName],
        isOverridden: hasUrlOverride || hasUserOverride,
        overrideSource: hasUrlOverride ? 'url' : hasUserOverride ? 'user' : null,
      };
    }

    return metadata;
  }
);

/**
 * Initialize feature flags store
 * Loads user overrides from localStorage and URL params
 */
export function initializeFeatureFlags(userId?: string | null): void {
  featureFlagsLoading.set(true);

  // Set user ID if provided
  if (userId !== undefined) {
    featureFlagUserId.set(userId);
  }

  // Load user overrides from localStorage
  const storedOverrides = loadUserOverrides();
  featureFlagOverrides.set(storedOverrides);

  // Parse URL overrides if in browser
  if (typeof window !== 'undefined') {
    const urlOverrides = parseUrlOverrides(window.location.href);
    if (Object.keys(urlOverrides).length > 0) {
      featureFlagUrlOverrides.set(urlOverrides);
      logger.info('[FeatureFlags] URL overrides applied:', urlOverrides);
    }
  }

  featureFlagsLoading.set(false);
  featureFlagsInitialized.set(true);
}

/**
 * Set user ID for percentage rollouts
 */
export function setFeatureFlagUserId(userId: string | null): void {
  featureFlagUserId.set(userId);
}

/**
 * Set user override for a specific flag
 */
export function setFeatureFlagOverride(flagName: FeatureFlagName, enabled: boolean): void {
  const current = featureFlagOverrides.get();
  const updated = { ...current, [flagName]: enabled };
  featureFlagOverrides.set(updated);
  saveUserOverrides(updated);
}

/**
 * Remove user override for a specific flag
 */
export function removeFeatureFlagOverride(flagName: FeatureFlagName): void {
  const current = featureFlagOverrides.get();
  const { [flagName]: _, ...rest } = current;
  featureFlagOverrides.set(rest);
  saveUserOverrides(rest);
}

/**
 * Clear all user overrides
 */
export function clearAllOverrides(): void {
  featureFlagOverrides.set({});
  clearUserOverrides();
}

/**
 * Set URL override for a specific flag (temporary, not persisted)
 */
export function setUrlOverride(flagName: FeatureFlagName, enabled: boolean): void {
  const current = featureFlagUrlOverrides.get();
  featureFlagUrlOverrides.set({ ...current, [flagName]: enabled });
}

/**
 * Clear URL overrides
 */
export function clearUrlOverrides(): void {
  featureFlagUrlOverrides.set({});
}

/**
 * Check if a feature flag is enabled (direct access, not reactive)
 */
export function isFlagEnabled(flagName: FeatureFlagName): boolean {
  return getFeatureFlagState(flagName, {
    userId: featureFlagUserId.get(),
    environment: featureFlagEnvironment.get(),
    userOverrides: combinedOverrides.get(),
  });
}

/**
 * Get all flags summary for debugging
 */
export function getFeatureFlagsSummary(): string {
  const states = featureFlagStates.get();
  const metadata = flagMetadata.get();
  const lines: string[] = ['Feature Flags Summary:', ''];

  for (const flagName of Object.values(FEATURE_FLAGS)) {
    const meta = metadata[flagName];
    const status = states[flagName] ? 'ON' : 'OFF';
    const override = meta.overrideSource ? ` (${meta.overrideSource} override)` : '';
    lines.push(`  ${flagName}: ${status}${override}`);
  }

  return lines.join('\n');
}

/**
 * Debug utility: log current feature flag states
 */
export function logFeatureFlags(): void {
  logger.info(getFeatureFlagsSummary());
  logger.info('User ID:', featureFlagUserId.get());
  logger.info('Environment:', featureFlagEnvironment.get());
}

/**
 * Toggle a feature flag on/off via the runtime override cache.
 * Reactively updates all computed stores.
 */
export function toggleFlag(key: FeatureFlagName): void {
  const current = isFlagEnabled(key);
  setFeatureFlag(key, !current);
  // Force recomputation by re-setting featureFlagStates dependencies
  // The simplest approach: bump the overrides map so computed stores re-derive
  featureFlagOverrides.set({ ...featureFlagOverrides.get() });
}

// Re-export convenience functions from the service layer
export { isFeatureEnabled, setFeatureFlag, getAllFlagsWithMetadata, resetFlagCache };

// Auto-initialize when imported in browser
if (typeof window !== 'undefined') {
  // Defer initialization to next tick to allow other stores to set up
  setTimeout(() => {
    if (!featureFlagsInitialized.get()) {
      initializeFeatureFlags();
    }
  }, 0);
}
