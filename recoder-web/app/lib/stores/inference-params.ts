import { atom, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('InferenceParams');

// Storage key
const INFERENCE_PARAMS_KEY = 'recoder_inference_params';

/**
 * Inference parameters for AI model configuration
 * Inspired by vscode-ai-toolkit playground
 */
export interface InferenceParams {
  /** Temperature controls randomness. Higher = more creative, lower = more deterministic (0-2) */
  temperature: number;
  /** Top P (nucleus sampling). Controls diversity via cumulative probability (0-1) */
  topP: number;
  /** Top K limits vocabulary to top K tokens (1-100) */
  topK: number;
  /** Frequency penalty reduces repetition of tokens based on frequency (-2 to 2) */
  frequencyPenalty: number;
  /** Presence penalty reduces repetition of topics/themes (-2 to 2) */
  presencePenalty: number;
  /** Maximum tokens in the response (1-128000) */
  maxTokens: number;
}

/**
 * Preset configurations for common use cases
 */
export interface InferencePreset {
  id: string;
  name: string;
  description: string;
  params: InferenceParams;
}

// Default parameter values (balanced for code generation)
export const DEFAULT_INFERENCE_PARAMS: InferenceParams = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxTokens: 16000,
};

// Preset configurations
export const INFERENCE_PRESETS: InferencePreset[] = [
  {
    id: 'creative',
    name: 'Creative',
    description: 'Higher randomness for creative and exploratory tasks',
    params: {
      temperature: 1.2,
      topP: 0.95,
      topK: 60,
      frequencyPenalty: 0.3,
      presencePenalty: 0.3,
      maxTokens: 16000,
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Default settings for general code generation',
    params: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxTokens: 16000,
    },
  },
  {
    id: 'precise',
    name: 'Precise',
    description: 'Lower randomness for deterministic, focused outputs',
    params: {
      temperature: 0.3,
      topP: 0.7,
      topK: 20,
      frequencyPenalty: 0.5,
      presencePenalty: 0.5,
      maxTokens: 16000,
    },
  },
];

// Parameter constraints
export const PARAM_CONSTRAINTS = {
  temperature: { min: 0, max: 2, step: 0.1 },
  topP: { min: 0, max: 1, step: 0.05 },
  topK: { min: 1, max: 100, step: 1 },
  frequencyPenalty: { min: -2, max: 2, step: 0.1 },
  presencePenalty: { min: -2, max: 2, step: 0.1 },
  maxTokens: { min: 100, max: 128000, step: 100 },
} as const;

// Parameter tooltips/descriptions
export const PARAM_TOOLTIPS: Record<keyof InferenceParams, string> = {
  temperature: 'Controls randomness. Higher values (e.g., 1.5) make output more creative and unpredictable. Lower values (e.g., 0.2) make it more focused and deterministic.',
  topP: 'Nucleus sampling. The model considers tokens with top_p probability mass. 0.1 = only top 10% likely tokens, 1.0 = all tokens.',
  topK: 'Limits vocabulary to top K most likely tokens. Lower values = more focused, higher = more diverse output.',
  frequencyPenalty: 'Reduces repetition by penalizing tokens based on how often they appear. Positive = less repetition, negative = more repetition.',
  presencePenalty: 'Reduces repetition by penalizing tokens that have appeared at all. Encourages discussing new topics.',
  maxTokens: 'Maximum number of tokens to generate in the response. Higher values allow longer responses.',
};

/**
 * Load inference params from localStorage
 */
function loadParams(): InferenceParams {
  if (typeof window === 'undefined') return DEFAULT_INFERENCE_PARAMS;

  try {
    const stored = localStorage.getItem(INFERENCE_PARAMS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new params
      return { ...DEFAULT_INFERENCE_PARAMS, ...parsed };
    }
  } catch (e) {
    logger.error('[InferenceParams] Failed to load params:', e);
  }

  return DEFAULT_INFERENCE_PARAMS;
}

/**
 * Save inference params to localStorage
 */
function saveParams(params: InferenceParams): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(INFERENCE_PARAMS_KEY, JSON.stringify(params));
  } catch (e) {
    logger.error('[InferenceParams] Failed to save params:', e);
  }
}

// Main store for inference parameters
export const inferenceParamsStore = map<InferenceParams>(loadParams());

// Subscribe to changes and persist
inferenceParamsStore.subscribe((params) => {
  saveParams(params);
});

// Current active preset (null if custom)
export const activePresetStore = atom<string | null>((() => {
  const currentParams = inferenceParamsStore.get();
  const matchingPreset = INFERENCE_PRESETS.find(
    (preset) =>
      preset.params.temperature === currentParams.temperature &&
      preset.params.topP === currentParams.topP &&
      preset.params.topK === currentParams.topK &&
      preset.params.frequencyPenalty === currentParams.frequencyPenalty &&
      preset.params.presencePenalty === currentParams.presencePenalty
  );
  return matchingPreset?.id || null;
})());

// Panel visibility
export const parameterPanelOpenStore = atom<boolean>(false);

/**
 * Update a single parameter
 */
export function updateParam<K extends keyof InferenceParams>(
  key: K,
  value: InferenceParams[K]
): void {
  const current = inferenceParamsStore.get();
  const constraints = PARAM_CONSTRAINTS[key];

  // Clamp value to constraints
  let clampedValue = value;
  if (typeof value === 'number') {
    clampedValue = Math.max(constraints.min, Math.min(constraints.max, value)) as InferenceParams[K];
  }

  inferenceParamsStore.set({
    ...current,
    [key]: clampedValue,
  });

  // Clear active preset since params are now custom
  activePresetStore.set(null);
}

/**
 * Apply a preset configuration
 */
export function applyPreset(presetId: string): void {
  const preset = INFERENCE_PRESETS.find((p) => p.id === presetId);
  if (preset) {
    inferenceParamsStore.set({ ...preset.params });
    activePresetStore.set(presetId);
  }
}

/**
 * Reset all parameters to defaults
 */
export function resetToDefaults(): void {
  inferenceParamsStore.set({ ...DEFAULT_INFERENCE_PARAMS });
  activePresetStore.set('balanced');
}

/**
 * Open the parameter panel
 */
export function openParameterPanel(): void {
  parameterPanelOpenStore.set(true);
}

/**
 * Close the parameter panel
 */
export function closeParameterPanel(): void {
  parameterPanelOpenStore.set(false);
}

/**
 * Toggle the parameter panel
 */
export function toggleParameterPanel(): void {
  parameterPanelOpenStore.set(!parameterPanelOpenStore.get());
}

/**
 * Get current params for API calls
 */
export function getInferenceParams(): InferenceParams {
  return inferenceParamsStore.get();
}
