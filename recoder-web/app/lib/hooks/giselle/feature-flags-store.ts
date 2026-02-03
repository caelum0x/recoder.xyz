/**
 * Giselle Feature Flags Store
 * Nanostore-based feature flag system for Giselle-specific features
 *
 * This is separate from the main recoder-web feature flag system
 * and is specifically for Giselle workflow features
 */

import { atom, computed, map } from 'nanostores';

// ============================================================
// Feature Flag Types
// ============================================================

export interface GiselleFeatureFlagConfig {
  key: string;
  description: string;
  defaultValue: boolean;
  options: Array<{ value: boolean; label: string }>;
}

export type GiselleFeatureFlagName =
  | 'webSearchAction'
  | 'layoutV3'
  | 'stage'
  | 'aiGateway'
  | 'aiGatewayUnsupportedModels'
  | 'googleUrlContext'
  | 'generateContentNode'
  | 'privatePreviewTools'
  | 'dataStore'
  | 'sdkAvailability'
  | 'streaming'
  | 'parallelGeneration'
  | 'retryOnFailure'
  | 'batchProcessing';

export interface GiselleFeatureFlagValues {
  webSearchAction: boolean;
  layoutV3: boolean;
  stage: boolean;
  aiGateway: boolean;
  aiGatewayUnsupportedModels: boolean;
  googleUrlContext: boolean;
  generateContentNode: boolean;
  privatePreviewTools: boolean;
  dataStore: boolean;
  sdkAvailability: boolean;
  streaming: boolean;
  parallelGeneration: boolean;
  retryOnFailure: boolean;
  batchProcessing: boolean;
}

// ============================================================
// Default Feature Flag Values
// ============================================================

const DEFAULT_FLAGS: GiselleFeatureFlagValues = {
  webSearchAction: false,
  layoutV3: false,
  stage: false,
  aiGateway: false,
  aiGatewayUnsupportedModels: false,
  googleUrlContext: false,
  generateContentNode: false,
  privatePreviewTools: false,
  dataStore: false,
  sdkAvailability: false,
  streaming: true,
  parallelGeneration: false,
  retryOnFailure: true,
  batchProcessing: false,
};

// ============================================================
// Feature Flag Configurations
// ============================================================

export const GISELLE_FEATURE_FLAG_CONFIGS: Record<
  GiselleFeatureFlagName,
  GiselleFeatureFlagConfig
> = {
  webSearchAction: {
    key: 'web-search-action',
    description: 'Enable web search action in workflows',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  layoutV3: {
    key: 'layout-v3',
    description: 'Enable new layout V3 for the editor',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  stage: {
    key: 'stage',
    description: 'Enable staging environment features',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  aiGateway: {
    key: 'ai-gateway',
    description: 'Enable AI Gateway for model routing',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  aiGatewayUnsupportedModels: {
    key: 'ai-gateway-unsupported-models',
    description: 'Allow unsupported models through AI Gateway',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  googleUrlContext: {
    key: 'google-url-context',
    description: 'Enable Google URL context extraction',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  generateContentNode: {
    key: 'generate-content-node',
    description: 'Enable content generation nodes',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  privatePreviewTools: {
    key: 'private-preview-tools',
    description: 'Enable private preview tools',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  dataStore: {
    key: 'data-store',
    description: 'Enable data store features',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  sdkAvailability: {
    key: 'sdk-availability',
    description: 'Enable SDK availability features',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  streaming: {
    key: 'streaming',
    description: 'Enable streaming for generation responses',
    defaultValue: true,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  parallelGeneration: {
    key: 'parallel-generation',
    description: 'Enable parallel generation execution',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  retryOnFailure: {
    key: 'retry-on-failure',
    description: 'Automatically retry failed generations',
    defaultValue: true,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
  batchProcessing: {
    key: 'batch-processing',
    description: 'Enable batch processing for multiple generations',
    defaultValue: false,
    options: [
      { value: false, label: 'Disabled' },
      { value: true, label: 'Enabled' },
    ],
  },
};

// ============================================================
// Stores
// ============================================================

/**
 * Feature flag values store
 */
export const $giselleFeatureFlags = map<GiselleFeatureFlagValues>({
  ...DEFAULT_FLAGS,
});

/**
 * Feature flag overrides (for testing/development)
 */
export const $giselleFeatureFlagOverrides = map<
  Partial<GiselleFeatureFlagValues>
>({});

/**
 * Initialization state
 */
export const $giselleFeatureFlagsInitialized = atom<boolean>(false);

// ============================================================
// Computed values
// ============================================================

/**
 * Effective feature flag values (base + overrides)
 */
export const $effectiveGiselleFeatureFlags = computed(
  [$giselleFeatureFlags, $giselleFeatureFlagOverrides],
  (flags, overrides) => ({
    ...flags,
    ...overrides,
  })
);

// Individual flag atoms for selective subscription
export const $webSearchActionEnabled = computed(
  $effectiveGiselleFeatureFlags,
  (flags) => flags.webSearchAction
);

export const $layoutV3Enabled = computed(
  $effectiveGiselleFeatureFlags,
  (flags) => flags.layoutV3
);

export const $stageEnabled = computed(
  $effectiveGiselleFeatureFlags,
  (flags) => flags.stage
);

export const $aiGatewayEnabled = computed(
  $effectiveGiselleFeatureFlags,
  (flags) => flags.aiGateway
);

export const $streamingEnabled = computed(
  $effectiveGiselleFeatureFlags,
  (flags) => flags.streaming
);

export const $parallelGenerationEnabled = computed(
  $effectiveGiselleFeatureFlags,
  (flags) => flags.parallelGeneration
);

export const $retryOnFailureEnabled = computed(
  $effectiveGiselleFeatureFlags,
  (flags) => flags.retryOnFailure
);

export const $batchProcessingEnabled = computed(
  $effectiveGiselleFeatureFlags,
  (flags) => flags.batchProcessing
);

// ============================================================
// Actions
// ============================================================

/**
 * Initialize feature flags with values from server/config
 */
export function initializeGiselleFeatureFlags(
  flags: Partial<GiselleFeatureFlagValues>
): void {
  $giselleFeatureFlags.set({
    ...DEFAULT_FLAGS,
    ...flags,
  });
  $giselleFeatureFlagsInitialized.set(true);
}

/**
 * Set a feature flag override (for testing)
 */
export function setGiselleFeatureFlagOverride(
  flag: GiselleFeatureFlagName,
  value: boolean
): void {
  $giselleFeatureFlagOverrides.setKey(flag, value);
}

/**
 * Remove a feature flag override
 */
export function removeGiselleFeatureFlagOverride(
  flag: GiselleFeatureFlagName
): void {
  const current = $giselleFeatureFlagOverrides.get();
  const { [flag]: removed, ...rest } = current;
  $giselleFeatureFlagOverrides.set(rest as Partial<GiselleFeatureFlagValues>);
}

/**
 * Clear all overrides
 */
export function clearGiselleFeatureFlagOverrides(): void {
  $giselleFeatureFlagOverrides.set({});
}

/**
 * Get a specific feature flag value
 */
export function getGiselleFeatureFlag(flag: GiselleFeatureFlagName): boolean {
  return $effectiveGiselleFeatureFlags.get()[flag];
}

/**
 * Check if a feature flag is overridden
 */
export function isGiselleFeatureFlagOverridden(
  flag: GiselleFeatureFlagName
): boolean {
  return flag in $giselleFeatureFlagOverrides.get();
}

/**
 * Reset feature flags to defaults
 */
export function resetGiselleFeatureFlags(): void {
  $giselleFeatureFlags.set({ ...DEFAULT_FLAGS });
  $giselleFeatureFlagOverrides.set({});
}
