/**
 * Workflow Feature Flags Store
 * Nanostore-based feature flag system for workflow-specific features
 */

import { atom, computed, map } from 'nanostores';

// ============================================================
// Feature Flag Types
// ============================================================

export interface WorkflowFeatureFlagConfig {
  key: string;
  description: string;
  defaultValue: boolean;
  category: 'generation' | 'task' | 'ui' | 'experimental';
}

export type WorkflowFeatureFlagName =
  // Generation features
  | 'streaming'
  | 'parallelGeneration'
  | 'retryOnFailure'
  | 'batchProcessing'
  | 'messageQueue'
  // Task features
  | 'taskPolling'
  | 'taskStreaming'
  | 'autoResume'
  // UI features
  | 'progressIndicator'
  | 'detailedErrors'
  | 'generationHistory'
  // Experimental
  | 'aiGateway'
  | 'webSearchAction'
  | 'imageGeneration'
  | 'dataStore';

export type WorkflowFeatureFlagValues = Record<WorkflowFeatureFlagName, boolean>;

// ============================================================
// Default Feature Flag Values
// ============================================================

const DEFAULT_FLAGS: WorkflowFeatureFlagValues = {
  // Generation features (mostly enabled by default)
  streaming: true,
  parallelGeneration: false,
  retryOnFailure: true,
  batchProcessing: true,
  messageQueue: true,
  // Task features
  taskPolling: true,
  taskStreaming: true,
  autoResume: true,
  // UI features
  progressIndicator: true,
  detailedErrors: true,
  generationHistory: true,
  // Experimental (disabled by default)
  aiGateway: false,
  webSearchAction: false,
  imageGeneration: false,
  dataStore: false,
};

// ============================================================
// Feature Flag Configurations
// ============================================================

export const WORKFLOW_FEATURE_FLAG_CONFIGS: Record<
  WorkflowFeatureFlagName,
  WorkflowFeatureFlagConfig
> = {
  streaming: {
    key: 'streaming',
    description: 'Enable streaming for generation responses',
    defaultValue: true,
    category: 'generation',
  },
  parallelGeneration: {
    key: 'parallel-generation',
    description: 'Enable parallel execution of independent generations',
    defaultValue: false,
    category: 'generation',
  },
  retryOnFailure: {
    key: 'retry-on-failure',
    description: 'Automatically retry failed generations',
    defaultValue: true,
    category: 'generation',
  },
  batchProcessing: {
    key: 'batch-processing',
    description: 'Batch message updates for better performance',
    defaultValue: true,
    category: 'generation',
  },
  messageQueue: {
    key: 'message-queue',
    description: 'Queue message updates using requestAnimationFrame',
    defaultValue: true,
    category: 'generation',
  },
  taskPolling: {
    key: 'task-polling',
    description: 'Enable polling for task status updates',
    defaultValue: true,
    category: 'task',
  },
  taskStreaming: {
    key: 'task-streaming',
    description: 'Enable SSE streaming for task updates',
    defaultValue: true,
    category: 'task',
  },
  autoResume: {
    key: 'auto-resume',
    description: 'Automatically resume in-progress tasks on mount',
    defaultValue: true,
    category: 'task',
  },
  progressIndicator: {
    key: 'progress-indicator',
    description: 'Show progress indicators during generation',
    defaultValue: true,
    category: 'ui',
  },
  detailedErrors: {
    key: 'detailed-errors',
    description: 'Show detailed error messages',
    defaultValue: true,
    category: 'ui',
  },
  generationHistory: {
    key: 'generation-history',
    description: 'Track and display generation history',
    defaultValue: true,
    category: 'ui',
  },
  aiGateway: {
    key: 'ai-gateway',
    description: 'Enable AI Gateway for model routing',
    defaultValue: false,
    category: 'experimental',
  },
  webSearchAction: {
    key: 'web-search-action',
    description: 'Enable web search action in workflows',
    defaultValue: false,
    category: 'experimental',
  },
  imageGeneration: {
    key: 'image-generation',
    description: 'Enable image generation nodes',
    defaultValue: false,
    category: 'experimental',
  },
  dataStore: {
    key: 'data-store',
    description: 'Enable data store features',
    defaultValue: false,
    category: 'experimental',
  },
};

// ============================================================
// Stores
// ============================================================

/**
 * Feature flag values store
 */
export const $workflowFeatureFlags = map<WorkflowFeatureFlagValues>({
  ...DEFAULT_FLAGS,
});

/**
 * Feature flag overrides (for testing/development)
 */
export const $workflowFeatureFlagOverrides = map<
  Partial<WorkflowFeatureFlagValues>
>({});

/**
 * Initialization state
 */
export const $workflowFeatureFlagsInitialized = atom<boolean>(false);

/**
 * Loading state
 */
export const $workflowFeatureFlagsLoading = atom<boolean>(false);

// ============================================================
// Computed values
// ============================================================

/**
 * Effective feature flag values (base + overrides)
 */
export const $effectiveWorkflowFeatureFlags = computed(
  [$workflowFeatureFlags, $workflowFeatureFlagOverrides],
  (flags, overrides) => ({
    ...flags,
    ...overrides,
  })
);

// Individual flag atoms for selective subscription
export const $streamingEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.streaming
);

export const $parallelGenerationEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.parallelGeneration
);

export const $retryOnFailureEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.retryOnFailure
);

export const $batchProcessingEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.batchProcessing
);

export const $messageQueueEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.messageQueue
);

export const $taskPollingEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.taskPolling
);

export const $taskStreamingEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.taskStreaming
);

export const $autoResumeEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.autoResume
);

export const $progressIndicatorEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.progressIndicator
);

export const $detailedErrorsEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.detailedErrors
);

export const $generationHistoryEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.generationHistory
);

export const $aiGatewayEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.aiGateway
);

export const $webSearchActionEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.webSearchAction
);

export const $imageGenerationEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.imageGeneration
);

export const $dataStoreEnabled = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => flags.dataStore
);

/**
 * Get flags by category
 */
export const $generationFeatureFlags = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => ({
    streaming: flags.streaming,
    parallelGeneration: flags.parallelGeneration,
    retryOnFailure: flags.retryOnFailure,
    batchProcessing: flags.batchProcessing,
    messageQueue: flags.messageQueue,
  })
);

export const $taskFeatureFlags = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => ({
    taskPolling: flags.taskPolling,
    taskStreaming: flags.taskStreaming,
    autoResume: flags.autoResume,
  })
);

export const $uiFeatureFlags = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => ({
    progressIndicator: flags.progressIndicator,
    detailedErrors: flags.detailedErrors,
    generationHistory: flags.generationHistory,
  })
);

export const $experimentalFeatureFlags = computed(
  $effectiveWorkflowFeatureFlags,
  (flags) => ({
    aiGateway: flags.aiGateway,
    webSearchAction: flags.webSearchAction,
    imageGeneration: flags.imageGeneration,
    dataStore: flags.dataStore,
  })
);

// ============================================================
// Actions
// ============================================================

/**
 * Initialize feature flags with values from server/config
 */
export function initializeWorkflowFeatureFlags(
  flags: Partial<WorkflowFeatureFlagValues>
): void {
  $workflowFeatureFlags.set({
    ...DEFAULT_FLAGS,
    ...flags,
  });
  $workflowFeatureFlagsInitialized.set(true);
}

/**
 * Set a feature flag override (for testing)
 */
export function setWorkflowFeatureFlagOverride(
  flag: WorkflowFeatureFlagName,
  value: boolean
): void {
  $workflowFeatureFlagOverrides.setKey(flag, value);
}

/**
 * Remove a feature flag override
 */
export function removeWorkflowFeatureFlagOverride(
  flag: WorkflowFeatureFlagName
): void {
  const current = $workflowFeatureFlagOverrides.get();
  const { [flag]: removed, ...rest } = current;
  $workflowFeatureFlagOverrides.set(rest as Partial<WorkflowFeatureFlagValues>);
}

/**
 * Clear all overrides
 */
export function clearWorkflowFeatureFlagOverrides(): void {
  $workflowFeatureFlagOverrides.set({});
}

/**
 * Get a specific feature flag value
 */
export function getWorkflowFeatureFlag(flag: WorkflowFeatureFlagName): boolean {
  return $effectiveWorkflowFeatureFlags.get()[flag];
}

/**
 * Check if a feature flag is overridden
 */
export function isWorkflowFeatureFlagOverridden(
  flag: WorkflowFeatureFlagName
): boolean {
  return flag in $workflowFeatureFlagOverrides.get();
}

/**
 * Reset feature flags to defaults
 */
export function resetWorkflowFeatureFlags(): void {
  $workflowFeatureFlags.set({ ...DEFAULT_FLAGS });
  $workflowFeatureFlagOverrides.set({});
  $workflowFeatureFlagsInitialized.set(false);
}

/**
 * Get all flags in a category
 */
export function getWorkflowFeatureFlagsByCategory(
  category: WorkflowFeatureFlagConfig['category']
): Partial<WorkflowFeatureFlagValues> {
  const flags = $effectiveWorkflowFeatureFlags.get();
  const result: Partial<WorkflowFeatureFlagValues> = {};

  for (const [name, config] of Object.entries(WORKFLOW_FEATURE_FLAG_CONFIGS)) {
    if (config.category === category) {
      result[name as WorkflowFeatureFlagName] =
        flags[name as WorkflowFeatureFlagName];
    }
  }

  return result;
}
