/**
 * `tz-config-generator.ts` — generate a TensorZero `tensorzero.toml` from the
 * inference domain's `ModelCatalogEntry[]` so the embedded gateway
 * (`getEmbeddedGateway()` in the engines tensorzero client) can route real
 * inference against Recoder's registered models.
 *
 * The TOML shape is PORTED (verified) from `backend/src/engines/tensorzero-config.ts`,
 * but made PURE: it takes typed catalog entries instead of reading `process.env`
 * (ARCHITECTURE §10.8 — no env in domain code). Materializing the string to a
 * temp file for `EmbeddedGateway.boot(configFile)` is the composer's job (env +
 * fs live in bootstrap/composer, not here).
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
 * SECURITY: the generated config carries env var NAMES (`api_key_location =
 * "env::X"`) only — never key material. BYOK per-user keys stay in the vault /
 * key-cache. An empty/disabled catalog yields an empty config string (the proven
 * `boot(null)` baseline) — never throws, never fakes.
 */
import type { ModelCatalogEntry } from '../types.js';

/** The env var name a provider's API key is read from at gateway boot. */
const PROVIDER_KEY_ENV: Readonly<Record<string, string>> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  gemini: 'GEMINI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  together: 'TOGETHER_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/** TensorZero provider `type` per Recoder provider (default: openai-compatible). */
const PROVIDER_TZ_TYPE: Readonly<Record<string, string>> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google_ai_studio_gemini',
  gemini: 'google_ai_studio_gemini',
  mistral: 'mistral',
  groq: 'openai',
  deepseek: 'openai',
  xai: 'openai',
  fireworks: 'openai',
  together: 'openai',
  openrouter: 'openai',
};

export interface GeneratedTzConfig {
  /** The TOML config string (empty when no usable models). */
  readonly toml: string;
  /** The model ids emitted into the config. */
  readonly models: readonly string[];
  /** Entries skipped (unknown provider / disabled) with a truthful reason. */
  readonly skipped: readonly { readonly modelId: string; readonly reason: string }[];
}

/** Derive a TOML-safe function name from a model id (`openai/gpt-4o-mini` → `openai_gpt_4o_mini`). */
export function functionNameFor(modelId: string): string {
  return modelId.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

/** Split a Recoder model id into `{ provider, modelName }` (best-effort). */
function splitModelId(entry: ModelCatalogEntry): { provider: string; modelName: string } {
  const slash = entry.modelId.indexOf('/');
  if (slash > 0) {
    return { provider: entry.provider || entry.modelId.slice(0, slash), modelName: entry.modelId.slice(slash + 1) };
  }
  return { provider: entry.provider, modelName: entry.modelId };
}

/**
 * Generate a TensorZero TOML config from the enabled catalog entries. Pure: no
 * env, no fs. Unknown-provider / disabled entries are skipped (recorded), never
 * emitted as boot-breaking config.
 */
export function generateTzConfig(entries: readonly ModelCatalogEntry[]): GeneratedTzConfig {
  const blocks: string[] = [];
  const models: string[] = [];
  const skipped: { modelId: string; reason: string }[] = [];

  for (const entry of entries) {
    if (!entry.enabled) {
      skipped.push({ modelId: entry.modelId, reason: 'disabled' });
      continue;
    }
    const { provider, modelName } = splitModelId(entry);
    const keyEnv = PROVIDER_KEY_ENV[provider];
    const tzType = PROVIDER_TZ_TYPE[provider];
    if (!keyEnv || !tzType) {
      skipped.push({ modelId: entry.modelId, reason: `unsupported provider '${provider}'` });
      continue;
    }

    const fn = functionNameFor(entry.modelId);
    blocks.push(
      [
        `[models.${quote(entry.modelId)}]`,
        `routing = [${quote(provider)}]`,
        '',
        `[models.${quote(entry.modelId)}.providers.${provider}]`,
        `type = ${quote(tzType)}`,
        `model_name = ${quote(modelName)}`,
        `api_key_location = ${quote(`env::${keyEnv}`)}`,
        '',
        `[functions.${fn}]`,
        `type = "chat"`,
        '',
        `[functions.${fn}.variants.default]`,
        `type = "chat_completion"`,
        `model = ${quote(entry.modelId)}`,
      ].join('\n'),
    );
    models.push(entry.modelId);
  }

  return { toml: blocks.join('\n\n') + (blocks.length ? '\n' : ''), models, skipped };
}

/** Minimal TOML string quoting (double-quote + escape backslash/quote). */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
