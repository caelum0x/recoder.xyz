/**
 * `tz-config-generator` — verifies the ported TensorZero TOML shape: one model +
 * function block per enabled+supported entry, env var NAME (never a value) in
 * `api_key_location`, and truthful skips for disabled/unknown-provider models.
 */
import { describe, it, expect } from 'vitest';
import { functionNameFor, generateTzConfig } from './tz-config-generator.js';
import type { ModelCatalogEntry } from '../types.js';

function entry(over: Partial<ModelCatalogEntry> & Pick<ModelCatalogEntry, 'modelId' | 'provider'>): ModelCatalogEntry {
  return {
    displayName: over.modelId,
    contextWindow: 128000,
    inputMicroUsdPerMTok: 0,
    outputMicroUsdPerMTok: 0,
    supportsStreaming: true,
    enabled: true,
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe('functionNameFor', () => {
  it('sanitizes a model id into a TOML-safe function name', () => {
    expect(functionNameFor('openai/gpt-4o-mini')).toBe('openai_gpt_4o_mini');
    expect(functionNameFor('anthropic/claude-3.5-sonnet')).toBe('anthropic_claude_3_5_sonnet');
  });
});

describe('generateTzConfig', () => {
  it('emits a model + function block per enabled entry with the key env NAME only', () => {
    const config = generateTzConfig([entry({ modelId: 'openai/gpt-4o-mini', provider: 'openai' })]);
    expect(config.models).toEqual(['openai/gpt-4o-mini']);
    expect(config.toml).toContain('[models."openai/gpt-4o-mini"]');
    expect(config.toml).toContain('[models."openai/gpt-4o-mini".providers.openai]');
    expect(config.toml).toContain('type = "openai"');
    expect(config.toml).toContain('model_name = "gpt-4o-mini"');
    expect(config.toml).toContain('api_key_location = "env::OPENAI_API_KEY"');
    expect(config.toml).toContain('[functions.openai_gpt_4o_mini]');
    expect(config.toml).toContain('type = "chat_completion"');
    // never a key VALUE
    expect(config.toml).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it('skips disabled + unknown-provider entries with a truthful reason', () => {
    const config = generateTzConfig([
      entry({ modelId: 'openai/gpt-4o', provider: 'openai', enabled: false }),
      entry({ modelId: 'acme/model-x', provider: 'acme' }),
    ]);
    expect(config.models).toEqual([]);
    expect(config.toml).toBe('');
    expect(config.skipped).toEqual([
      { modelId: 'openai/gpt-4o', reason: 'disabled' },
      { modelId: 'acme/model-x', reason: "unsupported provider 'acme'" },
    ]);
  });

  it('maps anthropic + google to their TensorZero provider types', () => {
    const config = generateTzConfig([
      entry({ modelId: 'anthropic/claude-3-5-haiku', provider: 'anthropic' }),
      entry({ modelId: 'google/gemini-1.5-pro', provider: 'google' }),
    ]);
    expect(config.toml).toContain('type = "anthropic"');
    expect(config.toml).toContain('api_key_location = "env::ANTHROPIC_API_KEY"');
    expect(config.toml).toContain('type = "google_ai_studio_gemini"');
  });
});
