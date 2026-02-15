/**
 * Feature Flags Service
 * Provides feature flag management with percentage rollouts, user-specific overrides,
 * and environment-based defaults.
 *
 * Inspired by giselle's implementation for gradual rollout capabilities.
 *
 * Features:
 * 1. Define feature flags with defaults
 * 2. Check if feature is enabled
 * 3. Support percentage rollouts
 * 4. User-specific overrides
 * 5. Environment-based defaults
 */

// Feature flag names as const for type safety
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FeatureFlags');

export const FEATURE_FLAGS = {
  EXPERIMENTAL_WORKFLOWS: 'EXPERIMENTAL_WORKFLOWS',
  MULTI_PROVIDER_AI: 'MULTI_PROVIDER_AI',
  CONTEXT_CONDENSATION: 'CONTEXT_CONDENSATION',
  EDIT_INTENT_ANALYZER: 'EDIT_INTENT_ANALYZER',
  BUILD_VALIDATOR: 'BUILD_VALIDATOR',
  MCP_INTEGRATION: 'MCP_INTEGRATION',
  MOBILE_PREVIEW: 'MOBILE_PREVIEW',
  FILE_BATCHING: 'FILE_BATCHING',
  CHECKPOINTS: 'CHECKPOINTS',
  // New flags — adapted from giselle's pattern for safe feature rollout
  ONE_SHOT_GENERATION: 'ONE_SHOT_GENERATION',
  ASK_MODE: 'ASK_MODE',
  CONTEXT_COMPACTION: 'CONTEXT_COMPACTION',
  EDIT_INTENT: 'EDIT_INTENT',
  AUTO_PACKAGE_DETECTION: 'AUTO_PACKAGE_DETECTION',
  CONFIG_PROTECTION: 'CONFIG_PROTECTION',
  COMPILE_CHECK: 'COMPILE_CHECK',
  CONTENT_SECURITY: 'CONTENT_SECURITY',
  ERROR_CLASSIFICATION: 'ERROR_CLASSIFICATION',
  VISUAL_EDITING: 'VISUAL_EDITING',
  EXPO_SUPPORT: 'EXPO_SUPPORT',
  COLLABORATION: 'COLLABORATION',
} as const;

export type FeatureFlagName = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

// Environment type for environment-based defaults
export type Environment = 'development' | 'staging' | 'production';

// Feature flag configuration
export interface FeatureFlagConfig {
  /** Default enabled state */
  defaultEnabled: boolean;
  /** Description of the feature */
  description: string;
  /** Percentage rollout (0-100). If undefined, use defaultEnabled */
  rolloutPercentage?: number;
  /** Environment-specific defaults */
  environmentDefaults?: Partial<Record<Environment, boolean>>;
  /** Flag is deprecated and will be removed */
  deprecated?: boolean;
  /** Date when the flag will be removed */
  deprecationDate?: string;
}

// Feature flag definition with all configuration
export interface FeatureFlagDefinition {
  name: FeatureFlagName;
  config: FeatureFlagConfig;
}

// Default feature flag configurations
export const DEFAULT_FLAG_CONFIGS: Record<FeatureFlagName, FeatureFlagConfig> = {
  [FEATURE_FLAGS.EXPERIMENTAL_WORKFLOWS]: {
    defaultEnabled: false,
    description: 'Enable experimental workflow automation features',
    rolloutPercentage: 0,
    environmentDefaults: {
      development: true,
      staging: true,
      production: false,
    },
  },
  [FEATURE_FLAGS.MULTI_PROVIDER_AI]: {
    defaultEnabled: true,
    description: 'Enable support for multiple AI providers (OpenRouter, Anthropic, etc.)',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.CONTEXT_CONDENSATION]: {
    defaultEnabled: true,
    description: 'Enable automatic context condensation for long conversations',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.EDIT_INTENT_ANALYZER]: {
    defaultEnabled: true,
    description: 'Enable edit intent analysis for smarter file targeting',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.BUILD_VALIDATOR]: {
    defaultEnabled: true,
    description: 'Enable build validation and error recovery',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.MCP_INTEGRATION]: {
    defaultEnabled: false,
    description: 'Enable Model Context Protocol (MCP) integration',
    rolloutPercentage: 0,
    environmentDefaults: {
      development: true,
      staging: true,
      production: false,
    },
  },
  [FEATURE_FLAGS.MOBILE_PREVIEW]: {
    defaultEnabled: true,
    description: 'Enable mobile device preview in workbench',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.FILE_BATCHING]: {
    defaultEnabled: true,
    description: 'Enable batched file operations for better performance',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.CHECKPOINTS]: {
    defaultEnabled: false,
    description: 'Enable checkpoint/snapshot system for project states',
    rolloutPercentage: 0,
    environmentDefaults: {
      development: true,
      staging: true,
      production: false,
    },
  },
  // ---- New flags (giselle-inspired safe rollout) ----
  [FEATURE_FLAGS.ONE_SHOT_GENERATION]: {
    defaultEnabled: true,
    description: 'Enhanced one-shot app generation pipeline',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.ASK_MODE]: {
    defaultEnabled: true,
    description: 'Ask mode that prevents code generation',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.CONTEXT_COMPACTION]: {
    defaultEnabled: true,
    description: 'Auto-compact conversation history when approaching context limits',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.EDIT_INTENT]: {
    defaultEnabled: true,
    description: 'Edit intent classification for surgical edits',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.AUTO_PACKAGE_DETECTION]: {
    defaultEnabled: true,
    description: 'Auto-detect and add missing npm packages',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.CONFIG_PROTECTION]: {
    defaultEnabled: true,
    description: 'Protect config files from AI overwrites during edits',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.COMPILE_CHECK]: {
    defaultEnabled: true,
    description: 'Post-generation compile error detection',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.CONTENT_SECURITY]: {
    defaultEnabled: true,
    description: 'Prompt injection detection on user messages',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.ERROR_CLASSIFICATION]: {
    defaultEnabled: true,
    description: 'Classify errors for better UX and retry logic',
    rolloutPercentage: 100,
  },
  [FEATURE_FLAGS.VISUAL_EDITING]: {
    defaultEnabled: false,
    description: 'Click-to-edit visual editing in preview',
    rolloutPercentage: 0,
    environmentDefaults: {
      development: false,
      staging: false,
      production: false,
    },
  },
  [FEATURE_FLAGS.EXPO_SUPPORT]: {
    defaultEnabled: false,
    description: 'React Native Expo project support',
    rolloutPercentage: 0,
    environmentDefaults: {
      development: false,
      staging: false,
      production: false,
    },
  },
  [FEATURE_FLAGS.COLLABORATION]: {
    defaultEnabled: false,
    description: 'Real-time collaboration features',
    rolloutPercentage: 0,
    environmentDefaults: {
      development: false,
      staging: false,
      production: false,
    },
  },
};

/**
 * Get the current environment
 */
export function getCurrentEnvironment(): Environment {
  if (typeof window === 'undefined') {
    // Server-side: check process.env
    const env = process.env.NODE_ENV;
    if (env === 'development') return 'development';
    if (env === 'test' || process.env.STAGING === 'true') return 'staging';
    return 'production';
  }

  // Client-side: check window.location or other indicators
  const hostname = window.location.hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'development';
  }

  if (hostname.includes('staging') || hostname.includes('preview') || hostname.includes('dev.')) {
    return 'staging';
  }

  return 'production';
}

/**
 * Generate a deterministic hash from a string
 * Used for consistent percentage rollout based on user ID
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Check if a user is within the rollout percentage
 * Uses deterministic hashing for consistent results
 */
export function isUserInRollout(userId: string | null, flagName: FeatureFlagName, percentage: number): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  if (!userId) return false;

  // Generate a consistent hash combining user ID and flag name
  const hash = hashString(`${userId}:${flagName}`);
  const userPercentile = hash % 100;

  return userPercentile < percentage;
}

/**
 * Convert a FEATURE_FLAGS key to the expected env var name.
 * Example: "ONE_SHOT_GENERATION" -> "FEATURE_ONE_SHOT_GENERATION"
 *
 * Adapted from giselle's `takeLocalEnv` pattern — env vars let you override
 * any flag without code changes or redeployment.
 */
function flagNameToEnvKey(flagName: string): string {
  return `FEATURE_${flagName}`;
}

/**
 * Check an environment variable for a flag override (giselle pattern).
 * Returns `true`/`false` if the env var is set, or `undefined` if absent.
 */
function checkEnvOverride(flagName: FeatureFlagName): boolean | undefined {
  const envKey = flagNameToEnvKey(flagName);

  // Server-side: read from process.env
  if (typeof process !== 'undefined' && process.env?.[envKey] !== undefined) {
    return process.env[envKey] === 'true';
  }

  return undefined;
}

/**
 * Get the effective enabled state for a feature flag.
 *
 * Resolution order (first match wins):
 *   1. Runtime cache (set via `setFeatureFlag`)
 *   2. User-specific override
 *   3. Environment variable  (FEATURE_<FLAG_NAME>=true|false) -- giselle pattern
 *   4. Environment-specific default (dev / staging / production)
 *   5. Percentage rollout (deterministic by userId)
 *   6. Default value from config
 */
export function getFeatureFlagState(
  flagName: FeatureFlagName,
  options: {
    userId?: string | null;
    userOverrides?: Partial<Record<FeatureFlagName, boolean>>;
    environment?: Environment;
  } = {}
): boolean {
  const { userId = null, userOverrides = {}, environment = getCurrentEnvironment() } = options;

  const config = DEFAULT_FLAG_CONFIGS[flagName];

  if (!config) {
    logger.warn(`[FeatureFlags] Unknown feature flag: ${flagName}`);
    return false;
  }

  // 1. Check runtime cache (setFeatureFlag)
  if (_runtimeOverrides.has(flagName)) {
    return _runtimeOverrides.get(flagName)!;
  }

  // 2. Check user-specific override
  if (userOverrides[flagName] !== undefined) {
    return userOverrides[flagName]!;
  }

  // 3. Check environment variable override (giselle pattern)
  const envValue = checkEnvOverride(flagName);
  if (envValue !== undefined) {
    return envValue;
  }

  // 4. Check environment-specific default
  if (config.environmentDefaults && config.environmentDefaults[environment] !== undefined) {
    return config.environmentDefaults[environment]!;
  }

  // 5. Check percentage rollout
  if (config.rolloutPercentage !== undefined && userId) {
    return isUserInRollout(userId, flagName, config.rolloutPercentage);
  }

  // 6. Fall back to default enabled state
  return config.defaultEnabled;
}

/**
 * Check if a feature flag is enabled
 * Convenience function with simpler interface
 */
export function isFeatureEnabled(
  flagName: FeatureFlagName,
  userId?: string | null,
  overrides?: Partial<Record<FeatureFlagName, boolean>>
): boolean {
  return getFeatureFlagState(flagName, {
    userId,
    userOverrides: overrides,
  });
}

/**
 * Get all feature flags and their current states
 */
export function getAllFeatureFlags(
  options: {
    userId?: string | null;
    userOverrides?: Partial<Record<FeatureFlagName, boolean>>;
    environment?: Environment;
  } = {}
): Record<FeatureFlagName, boolean> {
  const flags: Partial<Record<FeatureFlagName, boolean>> = {};

  for (const flagName of Object.values(FEATURE_FLAGS)) {
    flags[flagName] = getFeatureFlagState(flagName, options);
  }

  return flags as Record<FeatureFlagName, boolean>;
}

/**
 * Get feature flag configuration
 */
export function getFeatureFlagConfig(flagName: FeatureFlagName): FeatureFlagConfig | undefined {
  return DEFAULT_FLAG_CONFIGS[flagName];
}

/**
 * Get all feature flag configurations
 */
export function getAllFeatureFlagConfigs(): Record<FeatureFlagName, FeatureFlagConfig> {
  return { ...DEFAULT_FLAG_CONFIGS };
}

/**
 * Get deprecated feature flags
 */
export function getDeprecatedFlags(): FeatureFlagDefinition[] {
  return Object.entries(DEFAULT_FLAG_CONFIGS)
    .filter(([_, config]) => config.deprecated)
    .map(([name, config]) => ({
      name: name as FeatureFlagName,
      config,
    }));
}

/**
 * Validate that all required feature flags are defined
 */
export function validateFeatureFlags(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const flagName of Object.values(FEATURE_FLAGS)) {
    if (!DEFAULT_FLAG_CONFIGS[flagName]) {
      errors.push(`Missing configuration for feature flag: ${flagName}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Feature flag context for server-side usage
 */
export interface FeatureFlagContext {
  userId: string | null;
  environment: Environment;
  overrides: Partial<Record<FeatureFlagName, boolean>>;
}

/**
 * Create a feature flag evaluator with pre-bound context
 * Useful for server-side rendering or API routes
 */
export function createFeatureFlagEvaluator(context: FeatureFlagContext) {
  return {
    isEnabled: (flagName: FeatureFlagName) =>
      getFeatureFlagState(flagName, {
        userId: context.userId,
        userOverrides: context.overrides,
        environment: context.environment,
      }),
    getAll: () =>
      getAllFeatureFlags({
        userId: context.userId,
        userOverrides: context.overrides,
        environment: context.environment,
      }),
  };
}

/**
 * Parse feature flag overrides from URL parameters
 * Useful for testing and debugging
 * Example: ?ff_MOBILE_PREVIEW=true&ff_CHECKPOINTS=false
 */
export function parseUrlOverrides(url: string): Partial<Record<FeatureFlagName, boolean>> {
  const overrides: Partial<Record<FeatureFlagName, boolean>> = {};

  try {
    const urlObj = new URL(url, 'http://localhost');
    const params = urlObj.searchParams;

    for (const flagName of Object.values(FEATURE_FLAGS)) {
      const paramValue = params.get(`ff_${flagName}`);
      if (paramValue !== null) {
        overrides[flagName] = paramValue === 'true' || paramValue === '1';
      }
    }
  } catch (e) {
    // Invalid URL, return empty overrides
  }

  return overrides;
}

/**
 * Storage key for persisting user overrides
 */
const STORAGE_KEY = 'recoder_feature_flags';

/**
 * Load user overrides from localStorage
 */
export function loadUserOverrides(): Partial<Record<FeatureFlagName, boolean>> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate keys
      const validOverrides: Partial<Record<FeatureFlagName, boolean>> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (Object.values(FEATURE_FLAGS).includes(key as FeatureFlagName) && typeof value === 'boolean') {
          validOverrides[key as FeatureFlagName] = value;
        }
      }
      return validOverrides;
    }
  } catch (e) {
    logger.error('[FeatureFlags] Failed to load user overrides:', e);
  }

  return {};
}

/**
 * Save user overrides to localStorage
 */
export function saveUserOverrides(overrides: Partial<Record<FeatureFlagName, boolean>>): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (e) {
    logger.error('[FeatureFlags] Failed to save user overrides:', e);
  }
}

/**
 * Clear user overrides from localStorage
 */
export function clearUserOverrides(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    logger.error('[FeatureFlags] Failed to clear user overrides:', e);
  }
}

// ============================================================
// Simple convenience API — adapted from giselle's flags.ts
// These work with the flag key string directly (e.g. "ONE_SHOT_GENERATION")
// and are ideal for server-side checks or quick guards.
// ============================================================

/** Runtime overrides — set via `setFeatureFlag`, cleared via `resetFlagCache` */
const _runtimeOverrides = new Map<string, boolean>();

/**
 * Override a flag value at runtime (useful for admin panel, A/B testing, or tests).
 * Takes effect immediately for subsequent `getFeatureFlagState` / `isFeatureEnabled` calls.
 */
export function setFeatureFlag(flagKey: FeatureFlagName, enabled: boolean): void {
  _runtimeOverrides.set(flagKey, enabled);
}

/**
 * Get all flags with their current resolved values.
 * Each entry includes the config metadata and the live enabled state.
 */
export function getAllFlagsWithMetadata(): Array<FeatureFlagConfig & { key: FeatureFlagName; enabled: boolean }> {
  return (Object.entries(DEFAULT_FLAG_CONFIGS) as [FeatureFlagName, FeatureFlagConfig][]).map(
    ([key, config]) => ({
      ...config,
      key,
      enabled: getFeatureFlagState(key),
    })
  );
}

/**
 * Reset all runtime overrides (useful for testing).
 * Does NOT clear localStorage or URL overrides — only the in-memory cache.
 */
export function resetFlagCache(): void {
  _runtimeOverrides.clear();
}
