/**
 * `tensorzero-config` DB-catalog overlay merge (§4b). Verifies that
 * `generateTensorzeroConfig(env, overlay)` UNIONs the DB-catalog model/function
 * blocks over the env/registry config — name-keyed, DB overriding env — and
 * materializes EXACTLY ONE temp file, while a null / empty overlay stays
 * byte-identical to the env-only path (no new failure surface).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateTensorzeroConfig, mergeTensorzeroToml } from './tensorzero-config.js';
import { generateTzConfig, type GeneratedTzConfig } from './adapters/tz-config-generator.js';
import type { ModelCatalogEntry } from './types.js';

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

/** A DB-catalog overlay for the given model ids (built through the real generator). */
function overlay(...modelIds: string[]): GeneratedTzConfig {
  return generateTzConfig(modelIds.map((modelId) => entry({ modelId, provider: modelId.split('/')[0] })));
}

/** How many `[models."<id>"]` top-level headers a TOML string has for `id`. */
function modelHeaderCount(toml: string, id: string): number {
  return toml.split('\n').filter((line) => line === `[models."${id}"]`).length;
}

describe('mergeTensorzeroToml (§4b name-keyed union)', () => {
  it('keeps base-only + overlay-only model/function blocks', () => {
    const base = generateTzConfig([entry({ modelId: 'openai/gpt-4o-mini', provider: 'openai' })]).toml;
    const cat = generateTzConfig([entry({ modelId: 'anthropic/claude-3-5-haiku', provider: 'anthropic' })]).toml;
    const merged = mergeTensorzeroToml(base, cat);
    expect(merged).toContain('[models."openai/gpt-4o-mini"]');
    expect(merged).toContain('[models."anthropic/claude-3-5-haiku"]');
    expect(merged).toContain('[functions.openai_gpt_4o_mini]');
    expect(merged).toContain('[functions.anthropic_claude_3_5_haiku]');
  });

  it('DB overlay OVERRIDES an env block of the same model key (single copy, not duplicated)', () => {
    // Same model id in both — the overlay wins; the merged config has ONE block.
    const base = generateTzConfig([entry({ modelId: 'openai/gpt-4o-mini', provider: 'openai' })]).toml;
    const cat = generateTzConfig([entry({ modelId: 'openai/gpt-4o-mini', provider: 'openai' })]).toml;
    const merged = mergeTensorzeroToml(base, cat);
    expect(modelHeaderCount(merged, 'openai/gpt-4o-mini')).toBe(1);
    // Its function block is not duplicated either (no dangling / double function).
    expect(merged.split('\n').filter((l) => l === '[functions.openai_gpt_4o_mini]')).toHaveLength(1);
  });

  it('preserves the base comment preamble', () => {
    const base = '# Generated header — keep me.\n\n[models."openai/x"]\nrouting = ["openai"]\n';
    const merged = mergeTensorzeroToml(base, '');
    expect(merged.startsWith('# Generated header — keep me.')).toBe(true);
  });
});

describe('generateTensorzeroConfig with a DB-catalog overlay', () => {
  const KEEP = { models: process.env.TENSORZERO_MODELS, openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY };
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  });
  afterEach(() => {
    for (const [k, v] of [['TENSORZERO_MODELS', KEEP.models], ['OPENAI_API_KEY', KEEP.openai], ['ANTHROPIC_API_KEY', KEEP.anthropic]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('materializes ONE temp file whose content = env ∪ DB catalog (name-keyed)', () => {
    process.env.TENSORZERO_MODELS = 'openai/gpt-4o-mini';
    const result = generateTensorzeroConfig(process.env, overlay('anthropic/claude-3-5-haiku'));
    expect(result.path).toBeDefined();
    const toml = readFileSync(result.path!, 'utf8');
    expect(toml).toContain('[models."openai/gpt-4o-mini"]'); // from env
    expect(toml).toContain('[models."anthropic/claude-3-5-haiku"]'); // from DB catalog
    expect(result.functions).toEqual(expect.arrayContaining(['openai_gpt_4o_mini', 'anthropic_claude_3_5_haiku']));
  });

  it('boots on the DB catalog even when env registry is empty', () => {
    delete process.env.TENSORZERO_MODELS;
    const result = generateTensorzeroConfig(process.env, overlay('anthropic/claude-3-5-haiku'));
    expect(result.path).toBeDefined();
    const toml = readFileSync(result.path!, 'utf8');
    expect(toml).toContain('[models."anthropic/claude-3-5-haiku"]');
  });

  it('a null / empty overlay is byte-identical to the env-only path', () => {
    process.env.TENSORZERO_MODELS = 'openai/gpt-4o-mini';
    const envOnly = readFileSync(generateTensorzeroConfig(process.env).path!, 'utf8');
    const withNull = readFileSync(generateTensorzeroConfig(process.env, null).path!, 'utf8');
    const withEmpty = readFileSync(generateTensorzeroConfig(process.env, overlay()).path!, 'utf8');
    expect(withNull).toBe(envOnly);
    expect(withEmpty).toBe(envOnly);
  });

  it('no env models + no overlay ⇒ undefined path (default empty gateway config)', () => {
    delete process.env.TENSORZERO_MODELS;
    expect(generateTensorzeroConfig(process.env).path).toBeUndefined();
    expect(generateTensorzeroConfig(process.env, null).path).toBeUndefined();
  });
});
