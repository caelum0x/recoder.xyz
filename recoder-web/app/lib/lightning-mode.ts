/**
 * Lightning Mode - Fast model selection
 * Automatically switches to faster, cheaper models for quick responses
 */

export const LIGHTNING_MODELS = {
  'openrouter': 'google/gemini-2.0-flash-exp:free',
  'anthropic': 'anthropic/claude-3-haiku',
  'openai': 'openai/gpt-4o-mini',
  'google': 'google/gemini-2.0-flash-exp:free',
  'groq': 'groq/llama-3.3-70b-versatile',
};

export const STANDARD_MODELS = {
  'openrouter': 'anthropic/claude-3.5-sonnet',
  'anthropic': 'anthropic/claude-3.5-sonnet',
  'openai': 'openai/gpt-4o',
  'google': 'google/gemini-2.0-flash-thinking-exp:free',
  'groq': 'groq/llama-3.3-70b-versatile',
};

export function getLightningModel(provider: string): string {
  return LIGHTNING_MODELS[provider as keyof typeof LIGHTNING_MODELS] || LIGHTNING_MODELS.openrouter;
}

export function getStandardModel(provider: string): string {
  return STANDARD_MODELS[provider as keyof typeof STANDARD_MODELS] || STANDARD_MODELS.openrouter;
}

export function getModelForMode(provider: string, lightningMode: boolean): string {
  return lightningMode ? getLightningModel(provider) : getStandardModel(provider);
}
