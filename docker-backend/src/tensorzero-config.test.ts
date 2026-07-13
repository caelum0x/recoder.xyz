/**
 * Tests for TensorZero config generation (Wave G2 step 1 — CONFIG half).
 *
 * Pure-function + tmpdir coverage, no Rust addon and no gateway required:
 *   - registryFromEnv(): TENSORZERO_MODELS parsing, key-env gating, aliases,
 *     unknown providers, and the empty-env degrade path.
 *   - buildTensorzeroConfig(): [models] + [functions] TOML shape matching the
 *     schema in crates/tensorzero (docs + ui/fixtures), api_key_location uses
 *     env var NAMES only, api_base for local providers, name dedupe, and the
 *     stable `recoder_default` alias.
 *   - writeTensorzeroConfig(): materializes to a temp path; returns undefined
 *     on filesystem failure (never throws).
 *   - generateTensorzeroConfig(): end-to-end env -> file, and the
 *     no-models -> path undefined degrade path.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  registryFromEnv,
  buildTensorzeroConfig,
  writeTensorzeroConfig,
  generateTensorzeroConfig,
  tensorzeroFunctionName,
  TENSORZERO_MODELS_ENV,
  TENSORZERO_DEFAULT_FUNCTION,
  type TensorzeroRegistry,
} from './tensorzero-config.js';

// ---------------------------------------------------------------------------
// registryFromEnv
// ---------------------------------------------------------------------------

describe('tensorzero-config: registryFromEnv', () => {
  it('returns an empty registry when TENSORZERO_MODELS is unset (degrade-safe)', () => {
    const registry = registryFromEnv({});
    expect(registry.models).toEqual([]);
    expect(registry.skipped).toEqual([]);
  });

  it('includes models whose provider key env is set', () => {
    const registry = registryFromEnv({
      [TENSORZERO_MODELS_ENV]: 'openai/gpt-4o-mini, anthropic/claude-sonnet-4-5',
      OPENAI_API_KEY: 'k1',
      ANTHROPIC_API_KEY: 'k2',
    });
    expect(registry.models).toEqual([
      { provider: 'openai', modelName: 'gpt-4o-mini', keyEnv: 'OPENAI_API_KEY', baseUrl: undefined },
      {
        provider: 'anthropic',
        modelName: 'claude-sonnet-4-5',
        keyEnv: 'ANTHROPIC_API_KEY',
        baseUrl: undefined,
      },
    ]);
    expect(registry.skipped).toEqual([]);
  });

  it('skips (truthfully) models whose required key env is missing', () => {
    const registry = registryFromEnv({
      [TENSORZERO_MODELS_ENV]: 'openai/gpt-4o-mini,groq/llama-3.3-70b',
      OPENAI_API_KEY: 'k1',
    });
    expect(registry.models).toHaveLength(1);
    expect(registry.models[0]?.provider).toBe('openai');
    expect(registry.skipped).toEqual([
      { id: 'groq/llama-3.3-70b', reason: 'required key env GROQ_API_KEY is not set' },
    ]);
  });

  it('skips unknown providers and malformed ids with reasons', () => {
    const registry = registryFromEnv({
      [TENSORZERO_MODELS_ENV]: 'nonesuch/model-x,notaslash,openai/',
    });
    expect(registry.models).toEqual([]);
    expect(registry.skipped).toEqual([
      { id: 'nonesuch/model-x', reason: 'unknown provider "nonesuch"' },
      { id: 'notaslash', reason: 'expected "provider/model" format' },
      { id: 'openai/', reason: 'expected "provider/model" format' },
    ]);
  });

  it('resolves provider aliases (grok -> xai, gemini -> google)', () => {
    const registry = registryFromEnv({
      [TENSORZERO_MODELS_ENV]: 'grok/grok-3,gemini/gemini-2.0-flash',
      XAI_API_KEY: 'k1',
      GEMINI_API_KEY: 'k2',
    });
    expect(registry.models.map((m) => m.provider)).toEqual(['xai', 'google']);
  });

  it('gives ollama its default base URL and no key requirement', () => {
    const registry = registryFromEnv({
      [TENSORZERO_MODELS_ENV]: 'ollama/llama3.1',
    });
    expect(registry.models).toEqual([
      {
        provider: 'ollama',
        modelName: 'llama3.1',
        keyEnv: undefined,
        baseUrl: 'http://localhost:11434/v1',
      },
    ]);
  });

  it('respects OLLAMA_BASE_URL override', () => {
    const registry = registryFromEnv({
      [TENSORZERO_MODELS_ENV]: 'ollama/llama3.1',
      OLLAMA_BASE_URL: 'http://10.0.0.5:11434/v1',
    });
    expect(registry.models[0]?.baseUrl).toBe('http://10.0.0.5:11434/v1');
  });

  it('skips custom provider when CUSTOM_LLM_BASE_URL is not set', () => {
    const registry = registryFromEnv({
      [TENSORZERO_MODELS_ENV]: 'custom/my-model',
    });
    expect(registry.models).toEqual([]);
    expect(registry.skipped).toEqual([
      { id: 'custom/my-model', reason: 'base URL env CUSTOM_LLM_BASE_URL is not set' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildTensorzeroConfig — TOML shape
// ---------------------------------------------------------------------------

describe('tensorzero-config: buildTensorzeroConfig', () => {
  it('emits [models] + [functions] blocks matching the TensorZero schema', () => {
    const registry: TensorzeroRegistry = {
      models: [
        { provider: 'openai', modelName: 'gpt-4o-mini', keyEnv: 'OPENAI_API_KEY' },
      ],
      skipped: [],
    };
    const built = buildTensorzeroConfig(registry);

    expect(built.toml).toContain('[models."openai/gpt-4o-mini"]');
    expect(built.toml).toContain('routing = ["openai"]');
    expect(built.toml).toContain('[models."openai/gpt-4o-mini".providers."openai"]');
    expect(built.toml).toContain('type = "openai"');
    expect(built.toml).toContain('model_name = "gpt-4o-mini"');
    expect(built.toml).toContain('api_key_location = "env::OPENAI_API_KEY"');

    expect(built.toml).toContain('[functions.openai_gpt_4o_mini]');
    expect(built.toml).toContain('type = "chat"');
    expect(built.toml).toContain('[functions.openai_gpt_4o_mini.variants.default]');
    expect(built.toml).toContain('type = "chat_completion"');
    expect(built.toml).toContain('model = "openai/gpt-4o-mini"');
  });

  it('defines the stable recoder_default alias pointing at the first model', () => {
    const built = buildTensorzeroConfig({
      models: [
        { provider: 'openai', modelName: 'gpt-4o-mini', keyEnv: 'OPENAI_API_KEY' },
        { provider: 'anthropic', modelName: 'claude-sonnet-4-5', keyEnv: 'ANTHROPIC_API_KEY' },
      ],
      skipped: [],
    });
    expect(built.functions).toContain(TENSORZERO_DEFAULT_FUNCTION);
    expect(built.toml).toContain(`[functions.${TENSORZERO_DEFAULT_FUNCTION}.variants.default]`);
    // The alias points at the FIRST model.
    const aliasBlock = built.toml.split(`[functions.${TENSORZERO_DEFAULT_FUNCTION}.variants.default]`)[1] ?? '';
    expect(aliasBlock).toContain('model = "openai/gpt-4o-mini"');
  });

  it('maps google to google_ai_studio_gemini with the GEMINI_API_KEY env name', () => {
    const built = buildTensorzeroConfig({
      models: [{ provider: 'google', modelName: 'gemini-2.0-flash', keyEnv: 'GEMINI_API_KEY' }],
      skipped: [],
    });
    expect(built.toml).toContain('type = "google_ai_studio_gemini"');
    expect(built.toml).toContain('api_key_location = "env::GEMINI_API_KEY"');
  });

  it('maps ollama to an openai-compatible provider with api_base and no key', () => {
    const built = buildTensorzeroConfig({
      models: [{ provider: 'ollama', modelName: 'llama3.1', baseUrl: 'http://localhost:11434/v1' }],
      skipped: [],
    });
    expect(built.toml).toContain('type = "openai"');
    expect(built.toml).toContain('api_base = "http://localhost:11434/v1"');
    expect(built.toml).toContain('api_key_location = "none"');
  });

  it('never embeds key material — only env var names', () => {
    const built = buildTensorzeroConfig({
      models: [{ provider: 'openai', modelName: 'gpt-4o-mini', keyEnv: 'OPENAI_API_KEY' }],
      skipped: [],
    });
    // The known-dangerous shapes: actual key prefixes.
    expect(built.toml).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(built.toml).toContain('env::OPENAI_API_KEY');
  });

  it('dedupes colliding sanitized function names deterministically', () => {
    const built = buildTensorzeroConfig({
      models: [
        { provider: 'openai', modelName: 'gpt.4o', keyEnv: 'OPENAI_API_KEY' },
        { provider: 'openai', modelName: 'gpt-4o', keyEnv: 'OPENAI_API_KEY' },
      ],
      skipped: [],
    });
    const nonDefault = built.functions.filter((f) => f !== TENSORZERO_DEFAULT_FUNCTION);
    expect(new Set(nonDefault).size).toBe(nonDefault.length);
    expect(nonDefault).toEqual(['openai_gpt_4o', 'openai_gpt_4o_2']);
  });

  it('returns a comment-only config and no functions for an empty registry', () => {
    const built = buildTensorzeroConfig({ models: [], skipped: [] });
    expect(built.functions).toEqual([]);
    expect(built.toml).toContain('# Generated by');
    expect(built.toml).not.toContain('[models');
    expect(built.toml).not.toContain('[functions');
  });

  it('carries skipped entries through and skips unknown providers in models', () => {
    const built = buildTensorzeroConfig({
      models: [{ provider: 'nonesuch', modelName: 'x' }],
      skipped: [{ id: 'a/b', reason: 'earlier skip' }],
    });
    expect(built.functions).toEqual([]);
    expect(built.skipped).toEqual([
      { id: 'a/b', reason: 'earlier skip' },
      { id: 'nonesuch/x', reason: 'unknown provider "nonesuch"' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildTensorzeroConfig — round-trip through a real TOML parser
// ---------------------------------------------------------------------------

type TomlParse = (src: string) => Record<string, unknown>;

/**
 * Load a real TOML parser (prefer @iarna/toml, fall back to `toml` — both are
 * resolvable from the workspace root). Fails loudly if neither is available:
 * the round-trip assertion is the point of these tests, never skip it silently.
 */
async function loadTomlParse(): Promise<TomlParse> {
  try {
    const mod = (await import('@iarna/toml')) as unknown as {
      parse?: TomlParse;
      default?: { parse?: TomlParse };
    };
    const parse = mod.parse ?? mod.default?.parse;
    if (parse) return parse;
  } catch {
    // fall through to the `toml` package
  }
  const mod = (await import('toml')) as unknown as {
    parse?: TomlParse;
    default?: { parse?: TomlParse };
  };
  const parse = mod.parse ?? mod.default?.parse;
  if (!parse) throw new Error('no TOML parser available (@iarna/toml or toml)');
  return parse;
}

describe('tensorzero-config: TOML round-trip', () => {
  it('emitted config parses with a real TOML parser into the expected structure', async () => {
    const parse = await loadTomlParse();
    const built = buildTensorzeroConfig({
      models: [
        { provider: 'openai', modelName: 'gpt-4o-mini', keyEnv: 'OPENAI_API_KEY' },
        { provider: 'ollama', modelName: 'llama3.1', baseUrl: 'http://localhost:11434/v1' },
      ],
      skipped: [],
    });

    // Must be valid TOML — parse() throws on syntax errors.
    const parsed = parse(built.toml) as {
      models: Record<
        string,
        { routing: string[]; providers: Record<string, Record<string, unknown>> }
      >;
      functions: Record<
        string,
        { type: string; variants: Record<string, { type: string; model: string }> }
      >;
    };

    expect(Object.keys(parsed.models).sort()).toEqual(['ollama/llama3.1', 'openai/gpt-4o-mini']);
    const openaiModel = parsed.models['openai/gpt-4o-mini']!;
    expect(openaiModel.routing).toEqual(['openai']);
    expect(openaiModel.providers.openai).toMatchObject({
      type: 'openai',
      model_name: 'gpt-4o-mini',
      api_key_location: 'env::OPENAI_API_KEY',
    });
    const ollamaModel = parsed.models['ollama/llama3.1']!;
    expect(ollamaModel.providers.ollama).toMatchObject({
      type: 'openai',
      model_name: 'llama3.1',
      api_base: 'http://localhost:11434/v1',
      api_key_location: 'none',
    });

    expect(Object.keys(parsed.functions).sort()).toEqual([
      'ollama_llama3_1',
      'openai_gpt_4o_mini',
      TENSORZERO_DEFAULT_FUNCTION,
    ]);
    for (const fn of Object.values(parsed.functions)) {
      expect(fn.type).toBe('chat');
      expect(fn.variants.default?.type).toBe('chat_completion');
    }
    // The stable alias points at the FIRST model.
    expect(parsed.functions[TENSORZERO_DEFAULT_FUNCTION]!.variants.default!.model).toBe(
      'openai/gpt-4o-mini',
    );
  });

  it('degrade case: the empty-registry config parses as an empty TOML document', async () => {
    const parse = await loadTomlParse();
    const built = buildTensorzeroConfig({ models: [], skipped: [] });
    expect(parse(built.toml)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// tensorzeroFunctionName
// ---------------------------------------------------------------------------

describe('tensorzero-config: tensorzeroFunctionName', () => {
  it('sanitizes to [A-Za-z0-9_] and collapses runs', () => {
    expect(tensorzeroFunctionName('openai', 'gpt-4o-mini')).toBe('openai_gpt_4o_mini');
    expect(tensorzeroFunctionName('anthropic', 'claude-sonnet-4.5!!')).toBe(
      'anthropic_claude_sonnet_4_5',
    );
  });

  it('resolves aliases so names are stable across caller spellings', () => {
    expect(tensorzeroFunctionName('grok', 'grok-3')).toBe(tensorzeroFunctionName('xai', 'grok-3'));
  });
});

// ---------------------------------------------------------------------------
// writeTensorzeroConfig
// ---------------------------------------------------------------------------

describe('tensorzero-config: writeTensorzeroConfig', () => {
  it('writes the TOML to a temp path and returns it', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tz-conf-'));
    const toml = '# test config\n';
    const filePath = writeTensorzeroConfig(toml, { dir });
    expect(filePath).toBeDefined();
    expect(path.isAbsolute(filePath!)).toBe(true);
    expect(existsSync(filePath!)).toBe(true);
    expect(readFileSync(filePath!, 'utf8')).toBe(toml);
  });

  it('returns undefined (never throws) when the directory cannot be created', () => {
    // A path UNDER a regular file cannot be mkdir'd.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tz-conf-'));
    const blocker = path.join(dir, 'blocker');
    writeFileSync(blocker, 'not a dir');
    const filePath = writeTensorzeroConfig('# x\n', { dir: path.join(blocker, 'sub') });
    expect(filePath).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateTensorzeroConfig — end to end
// ---------------------------------------------------------------------------

describe('tensorzero-config: generateTensorzeroConfig', () => {
  it('returns path undefined with no crash when no models are usable', () => {
    const result = generateTensorzeroConfig({});
    expect(result.path).toBeUndefined();
    expect(result.functions).toEqual([]);
  });

  it('materializes a config file for a usable env registry', () => {
    const result = generateTensorzeroConfig({
      [TENSORZERO_MODELS_ENV]: 'openai/gpt-4o-mini',
      OPENAI_API_KEY: 'test-key-not-real',
    });
    expect(result.path).toBeDefined();
    expect(existsSync(result.path!)).toBe(true);
    expect(result.functions).toEqual(['openai_gpt_4o_mini', TENSORZERO_DEFAULT_FUNCTION]);

    const content = readFileSync(result.path!, 'utf8');
    expect(content).toContain('[models."openai/gpt-4o-mini"]');
    expect(content).toContain('api_key_location = "env::OPENAI_API_KEY"');
    // The key VALUE must never be written to disk.
    expect(content).not.toContain('test-key-not-real');
  });
});
