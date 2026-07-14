/**
 * @module tensorzero-config
 *
 * TensorZero config generation — Wave G2 step 1 (CONFIG-GENERATION half).
 *
 * Generates a `tensorzero.toml` from Recoder's model/provider registry so the
 * embedded gateway (`getEmbeddedGateway()` in tensorzero-client.ts) can route
 * real inference. The embedded gateway boots from a config FILE PATH
 * (`ClientBuilderMode::EmbeddedGateway { config_file }`), so this module:
 *
 *   1. Resolves a model registry from the environment (`TENSORZERO_MODELS`,
 *      a comma-separated list of Recoder `provider/model` ids — the same id
 *      format `llm-router.ts` uses) plus the per-provider key env vars.
 *   2. Builds a TOML config string with one `[models."<provider>/<model>"]`
 *      entry + one `[functions.<name>]` (type = "chat") per registry model,
 *      each with a `default` chat_completion variant pointing at the model.
 *   3. Materializes the TOML to a temp path for `EmbeddedGateway.boot()`.
 *
 * CONFIG SHAPE (verified against modules/inference/tensorzero docs + ui/fixtures):
 *
 *   [models."openai/gpt-4o-mini"]
 *   routing = ["openai"]
 *
 *   [models."openai/gpt-4o-mini".providers.openai]
 *   type = "openai"
 *   model_name = "gpt-4o-mini"
 *   api_key_location = "env::OPENAI_API_KEY"   # env var NAME — never a value
 *
 *   [functions.openai_gpt_4o_mini]
 *   type = "chat"
 *
 *   [functions.openai_gpt_4o_mini.variants.default]
 *   type = "chat_completion"
 *   model = "openai/gpt-4o-mini"
 *
 * SECURITY: the generated file contains env var NAMES (api_key_location =
 * "env::X") and base URLs only — never key material. BYOK per-user keys stay
 * in the vault/key-cache; runtime pass-through is the run-loop half of G2.
 *
 * DEGRADE-SAFE CONTRACT:
 *   - No registry / no keys → no models → `generateTensorzeroConfig()` returns
 *     `path: undefined` and the embedded gateway boots its default empty
 *     config (the proven `boot(null)` path). Never throws, never fakes.
 *   - Providers with a missing required key env are skipped (recorded in
 *     `skipped`, logged) rather than emitted as boot-breaking config.
 *   - Filesystem failures in `writeTensorzeroConfig()` return `undefined`.
 *
 * Provider names mirror `KnownProvider` in llm-router.ts (the effective
 * Recoder provider registry). Keep the two maps in sync when adding providers.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createLogger } from './logger.js';

const logger = createLogger('tensorzero-config');

// ---------------------------------------------------------------------------
// Registry types
// ---------------------------------------------------------------------------

/** One model the gateway should be able to route to. */
export interface TensorzeroModelEntry {
  /** Recoder provider name (mirrors `KnownProvider` in llm-router.ts). */
  provider: string;
  /** Provider-native model id (e.g. "gpt-4o-mini"). */
  modelName: string;
  /** Env var NAME holding the API key (never the value). */
  keyEnv?: string;
  /** OpenAI-compatible base URL override (ollama/vllm/custom). */
  baseUrl?: string;
}

/** A skipped registry entry with a truthful reason (never silent). */
export interface TensorzeroSkippedEntry {
  id: string;
  reason: string;
}

export interface TensorzeroRegistry {
  models: TensorzeroModelEntry[];
  skipped: TensorzeroSkippedEntry[];
}

export interface TensorzeroBuiltConfig {
  /** The tensorzero.toml content. */
  toml: string;
  /** TensorZero function names defined by this config (for postInference). */
  functions: string[];
  /** Entries that could not be mapped to a TensorZero provider. */
  skipped: TensorzeroSkippedEntry[];
}

/** Env var: comma-separated `provider/model` ids to expose via the gateway. */
export const TENSORZERO_MODELS_ENV = 'TENSORZERO_MODELS';

/**
 * Stable function name callers can use without knowing the registry: an alias
 * of the FIRST registry model's function (defined only when >=1 model exists).
 */
export const TENSORZERO_DEFAULT_FUNCTION = 'recoder_default';

// ---------------------------------------------------------------------------
// Provider mapping (Recoder provider -> TensorZero provider block)
// ---------------------------------------------------------------------------

interface TzProviderMapping {
  /** TensorZero provider `type` (verified against modules/inference/tensorzero docs). */
  tzType: string;
  /** Env var NAME for the key (mirrors llm-router's keyEnv). */
  keyEnv?: string;
  /** Whether a key is required for the provider to be usable. */
  keyRequired: boolean;
  /** Env var holding a base URL override, plus its default (local providers). */
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
}

/**
 * Mirrors the PROVIDERS map in llm-router.ts (Recoder's effective provider
 * registry — llm-router does not export it). `google` maps to TensorZero's
 * `google_ai_studio_gemini`; local/OpenAI-compatible providers map to
 * `type = "openai"` (+ `api_base`), matching TensorZero's openai-compatible
 * integration docs.
 */
const TZ_PROVIDERS: Readonly<Record<string, TzProviderMapping>> = {
  openai: { tzType: 'openai', keyEnv: 'OPENAI_API_KEY', keyRequired: true },
  anthropic: { tzType: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY', keyRequired: true },
  openrouter: { tzType: 'openrouter', keyEnv: 'OPENROUTER_API_KEY', keyRequired: true },
  groq: { tzType: 'groq', keyEnv: 'GROQ_API_KEY', keyRequired: true },
  deepseek: { tzType: 'deepseek', keyEnv: 'DEEPSEEK_API_KEY', keyRequired: true },
  xai: { tzType: 'xai', keyEnv: 'XAI_API_KEY', keyRequired: true },
  google: { tzType: 'google_ai_studio_gemini', keyEnv: 'GEMINI_API_KEY', keyRequired: true },
  mistral: { tzType: 'mistral', keyEnv: 'MISTRAL_API_KEY', keyRequired: true },
  together: { tzType: 'together', keyEnv: 'TOGETHER_API_KEY', keyRequired: true },
  ollama: {
    tzType: 'openai',
    keyRequired: false,
    baseUrlEnv: 'OLLAMA_BASE_URL',
    defaultBaseUrl: 'http://localhost:11434/v1',
  },
  vllm: {
    tzType: 'vllm',
    keyEnv: 'VLLM_API_KEY',
    keyRequired: false,
    baseUrlEnv: 'VLLM_BASE_URL',
    defaultBaseUrl: 'http://localhost:8000/v1',
  },
  custom: {
    tzType: 'openai',
    keyEnv: 'CUSTOM_LLM_API_KEY',
    keyRequired: false,
    baseUrlEnv: 'CUSTOM_LLM_BASE_URL',
    // No default: `custom` without CUSTOM_LLM_BASE_URL is skipped truthfully.
  },
};

/** Aliases so callers can use natural names (mirrors llm-router.ts). */
const PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  grok: 'xai',
  gemini: 'google',
  'x.ai': 'xai',
  llama: 'ollama',
};

function canonicalProvider(name: string): string {
  const lower = name.trim().toLowerCase();
  return PROVIDER_ALIASES[lower] ?? lower;
}

// ---------------------------------------------------------------------------
// Registry resolution from the environment
// ---------------------------------------------------------------------------

/**
 * Resolve the model registry from the environment.
 *
 * Reads `TENSORZERO_MODELS` as a comma-separated list of `provider/model`
 * ids (the same id format llm-router.ts routes on, e.g.
 * "openai/gpt-4o-mini,anthropic/claude-sonnet-4-5"). Entries are included
 * only when their provider is known AND its required key env var is present —
 * missing keys are recorded in `skipped`, never emitted as broken config.
 *
 * No env / empty env → `{ models: [], skipped: [] }`. Never throws.
 */
export function registryFromEnv(env: NodeJS.ProcessEnv = process.env): TensorzeroRegistry {
  const spec = env[TENSORZERO_MODELS_ENV]?.trim();
  if (!spec) return { models: [], skipped: [] };

  const models: TensorzeroModelEntry[] = [];
  const skipped: TensorzeroSkippedEntry[] = [];

  for (const rawId of spec.split(',')) {
    const id = rawId.trim();
    if (!id) continue;

    const slash = id.indexOf('/');
    if (slash <= 0 || slash === id.length - 1) {
      skipped.push({ id, reason: 'expected "provider/model" format' });
      continue;
    }

    const provider = canonicalProvider(id.slice(0, slash));
    const modelName = id.slice(slash + 1).trim();
    const mapping = TZ_PROVIDERS[provider];

    if (!mapping) {
      skipped.push({ id, reason: `unknown provider "${provider}"` });
      continue;
    }
    if (mapping.keyRequired && mapping.keyEnv && !env[mapping.keyEnv]?.trim()) {
      skipped.push({ id, reason: `required key env ${mapping.keyEnv} is not set` });
      continue;
    }

    const baseUrl = mapping.baseUrlEnv
      ? env[mapping.baseUrlEnv]?.trim() || mapping.defaultBaseUrl
      : undefined;
    if (mapping.baseUrlEnv && !baseUrl) {
      skipped.push({ id, reason: `base URL env ${mapping.baseUrlEnv} is not set` });
      continue;
    }

    // Include keyEnv only when the env var is actually set — an `env::X`
    // api_key_location with X unset would fail the gateway at boot.
    const keyEnv = mapping.keyEnv && env[mapping.keyEnv]?.trim() ? mapping.keyEnv : undefined;

    models.push({ provider, modelName, keyEnv, baseUrl });
  }

  if (skipped.length > 0) {
    logger.info({ skipped }, 'tensorzero registry: some model ids were skipped (degrade-safe)');
  }
  return { models, skipped };
}

// ---------------------------------------------------------------------------
// TOML generation
// ---------------------------------------------------------------------------

/** Escape a value for a TOML basic (double-quoted) string. */
function tomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    // Control chars are invalid inside TOML basic strings — strip them.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, "");
  return `"${escaped}"`;
}

/**
 * Derive the TensorZero function name for a registry model. Deterministic and
 * TOML-bare-key/metric safe ([A-Za-z0-9_]). `postInference()` callers use this
 * same convention to address a model's function.
 */
export function tensorzeroFunctionName(provider: string, modelName: string): string {
  const raw = `${canonicalProvider(provider)}_${modelName}`
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const name = raw || 'model';
  return /^[0-9]/.test(name) ? `m_${name}` : name;
}

function emitFunctionBlock(lines: string[], fnName: string, modelKey: string): void {
  lines.push(`[functions.${fnName}]`);
  lines.push('type = "chat"');
  lines.push('');
  lines.push(`[functions.${fnName}.variants.default]`);
  lines.push('type = "chat_completion"');
  lines.push(`model = ${tomlString(modelKey)}`);
  lines.push('');
}

/**
 * Build a tensorzero.toml config string from a registry (pure — no I/O).
 *
 * Per model: a `[models."<provider>/<model>"]` block (explicit provider with
 * `api_key_location = "env::<keyEnv>"` so Recoder's env names apply — no
 * reliance on TensorZero's shorthand default env names), plus a
 * `[functions.<name>]` chat function with a single `default` variant.
 * The first model additionally gets the stable `recoder_default` function.
 *
 * Empty registry → a comment-only TOML string and `functions: []`.
 */
export function buildTensorzeroConfig(registry: TensorzeroRegistry): TensorzeroBuiltConfig {
  const lines: string[] = [
    '# Generated by backend/src/tensorzero-config.ts — DO NOT EDIT.',
    '# Contains env var NAMES and base URLs only; never key material.',
    '',
  ];
  const functions: string[] = [];
  const skipped: TensorzeroSkippedEntry[] = [...registry.skipped];
  const usedFnNames = new Set<string>();

  for (const entry of registry.models) {
    const provider = canonicalProvider(entry.provider);
    const mapping = TZ_PROVIDERS[provider];
    const id = `${provider}/${entry.modelName}`;

    if (!mapping) {
      skipped.push({ id, reason: `unknown provider "${provider}"` });
      continue;
    }
    if (!entry.modelName.trim()) {
      skipped.push({ id, reason: 'empty model name' });
      continue;
    }

    const modelKey = id;
    let fnName = tensorzeroFunctionName(provider, entry.modelName);
    for (let i = 2; usedFnNames.has(fnName); i++) {
      fnName = `${tensorzeroFunctionName(provider, entry.modelName)}_${i}`;
    }
    usedFnNames.add(fnName);

    // [models."<key>"]
    lines.push(`[models.${tomlString(modelKey)}]`);
    lines.push(`routing = [${tomlString(provider)}]`);
    lines.push('');
    // [models."<key>".providers.<provider>]
    lines.push(`[models.${tomlString(modelKey)}.providers.${tomlString(provider)}]`);
    lines.push(`type = ${tomlString(mapping.tzType)}`);
    lines.push(`model_name = ${tomlString(entry.modelName)}`);
    if (entry.baseUrl) {
      lines.push(`api_base = ${tomlString(entry.baseUrl)}`);
    }
    if (entry.keyEnv) {
      lines.push(`api_key_location = ${tomlString(`env::${entry.keyEnv}`)}`);
    } else if (!mapping.keyRequired) {
      lines.push('api_key_location = "none"');
    }
    lines.push('');

    emitFunctionBlock(lines, fnName, modelKey);
    functions.push(fnName);

    // Stable default alias for the FIRST model so callers have a fixed name.
    if (functions.length === 1) {
      emitFunctionBlock(lines, TENSORZERO_DEFAULT_FUNCTION, modelKey);
      functions.push(TENSORZERO_DEFAULT_FUNCTION);
    }
  }

  return { toml: `${lines.join('\n')}\n`, functions, skipped };
}

// ---------------------------------------------------------------------------
// Materialization
// ---------------------------------------------------------------------------

/**
 * Write a generated config to disk and return its absolute path (for
 * `getEmbeddedGateway()` / `EmbeddedGateway.boot(configFile)`).
 *
 * Default location: `<os.tmpdir()>/recoder-tensorzero/tensorzero-<pid>.toml`
 * (pid-scoped so concurrent backends never clobber each other).
 *
 * Returns `undefined` on any filesystem failure — never throws.
 */
export function writeTensorzeroConfig(
  toml: string,
  options: { dir?: string } = {},
): string | undefined {
  const dir = options.dir ?? path.join(os.tmpdir(), 'recoder-tensorzero');
  const filePath = path.join(dir, `tensorzero-${process.pid}.toml`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, toml, { encoding: 'utf8', mode: 0o600 });
    return filePath;
  } catch (err) {
    logger.warn(
      { err, filePath },
      'failed to write generated tensorzero config — embedded gateway will boot its default config (degrade-safe)',
    );
    return undefined;
  }
}

export interface TensorzeroGeneratedConfig {
  /** Absolute path to the materialized config, or undefined when no models. */
  path: string | undefined;
  /** Function names defined by the config (empty when path is undefined). */
  functions: string[];
  /** Truthful record of registry entries that were not included. */
  skipped: TensorzeroSkippedEntry[];
}

/**
 * End-to-end convenience: env → registry → TOML → temp file path.
 *
 * With no usable models the config is NOT written and `path` is `undefined` —
 * `getEmbeddedGateway()` then boots TensorZero's default empty config (the
 * proven `boot(null)` path). Never throws.
 */
export function generateTensorzeroConfig(
  env: NodeJS.ProcessEnv = process.env,
): TensorzeroGeneratedConfig {
  const registry = registryFromEnv(env);
  const built = buildTensorzeroConfig(registry);

  if (built.functions.length === 0) {
    logger.info(
      { skipped: built.skipped },
      'no usable tensorzero models in registry — embedded gateway will use its default config',
    );
    return { path: undefined, functions: [], skipped: built.skipped };
  }

  const filePath = writeTensorzeroConfig(built.toml);
  if (filePath) {
    logger.info(
      { path: filePath, functions: built.functions, skipped: built.skipped },
      'generated tensorzero config from Recoder model registry',
    );
  }
  return {
    path: filePath,
    functions: filePath ? built.functions : [],
    skipped: built.skipped,
  };
}
