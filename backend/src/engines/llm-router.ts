/**
 * @module llm-router
 *
 * Unified multi-model LLM router — the "all models as one" capability, inspired
 * by pal-mcp-server (BeehiveInnovations) and pi (earendil-works). A single
 * `chatComplete` call routes to any provider by a `provider/model` id
 * (OpenAI, OpenRouter, Groq, DeepSeek, xAI/Grok, Google Gemini, Mistral,
 * Together, Ollama, or a custom base URL), normalizing request and response to
 * the OpenAI chat shape. Anthropic is handled via its native Messages API.
 *
 * BYOK-aware: a key can be passed directly, resolved per-user from the BYOK
 * store, or fall back to an environment variable. Fail-safe: a missing key
 * yields an explicit error — it never silently picks a different provider.
 */

import { createLogger } from './logger';

const logger = createLogger('llm-router');

export type KnownProvider =
  | 'openai'
  | 'openrouter'
  | 'groq'
  | 'deepseek'
  | 'xai'
  | 'google'
  | 'mistral'
  | 'together'
  | 'ollama'
  | 'vllm'
  | 'anthropic'
  | 'custom';

interface ProviderConfig {
  /** OpenAI-compatible base URL (ignored for anthropic, which uses native API). */
  baseUrl: string;
  /** Env var fallback for the API key. */
  keyEnv?: string;
  /** BYOK store field name (defaults to the provider name). */
  byokField?: string;
  /** Whether a key is required (ollama/custom-local may not need one). */
  keyRequired: boolean;
  /** 'openai' = /chat/completions Bearer; 'anthropic' = native messages. */
  style: 'openai' | 'anthropic';
}

const PROVIDERS: Record<KnownProvider, ProviderConfig> = {
  openai: { baseUrl: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY', keyRequired: true, style: 'openai' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY', keyRequired: true, style: 'openai' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY', keyRequired: true, style: 'openai' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', keyEnv: 'DEEPSEEK_API_KEY', keyRequired: true, style: 'openai' },
  xai: { baseUrl: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY', byokField: 'xai', keyRequired: true, style: 'openai' },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    byokField: 'google',
    keyRequired: true,
    style: 'openai',
  },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', keyEnv: 'MISTRAL_API_KEY', keyRequired: true, style: 'openai' },
  together: { baseUrl: 'https://api.together.xyz/v1', keyEnv: 'TOGETHER_API_KEY', keyRequired: true, style: 'openai' },
  ollama: { baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1', keyRequired: false, style: 'openai' },
  vllm: { baseUrl: process.env.VLLM_BASE_URL || 'http://localhost:8000/v1', keyEnv: 'VLLM_API_KEY', keyRequired: false, style: 'openai' },
  anthropic: { baseUrl: 'https://api.anthropic.com', keyEnv: 'ANTHROPIC_API_KEY', keyRequired: true, style: 'anthropic' },
  custom: { baseUrl: process.env.CUSTOM_LLM_BASE_URL || '', keyEnv: 'CUSTOM_LLM_API_KEY', keyRequired: false, style: 'openai' },
};

// Aliases so callers can use natural names.
const PROVIDER_ALIASES: Record<string, KnownProvider> = {
  grok: 'xai',
  gemini: 'google',
  'x.ai': 'xai',
  llama: 'ollama',
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompleteParams {
  /** "provider/model" (e.g. "anthropic/claude-3-5-sonnet-latest") or just a model with explicit `provider`. */
  model: string;
  messages: ChatMessage[];
  provider?: string;
  apiKey?: string;
  userId?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatCompleteResult {
  ok: boolean;
  provider: KnownProvider;
  model: string;
  content?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  error?: string;
}

export function parseModel(model: string, explicitProvider?: string): { provider: KnownProvider; modelId: string } {
  let provider = explicitProvider?.trim().toLowerCase();
  let modelId = model;

  if (!provider && model.includes('/')) {
    const idx = model.indexOf('/');
    provider = model.slice(0, idx).toLowerCase();
    modelId = model.slice(idx + 1);
  }
  if (!provider) provider = 'openrouter'; // sensible default that fronts many models

  const resolved = (PROVIDER_ALIASES[provider] ?? provider) as KnownProvider;
  const known = (resolved in PROVIDERS ? resolved : 'openrouter') as KnownProvider;
  return { provider: known, modelId };
}

async function resolveKey(provider: KnownProvider, params: ChatCompleteParams): Promise<string | undefined> {
  if (params.apiKey) return params.apiKey;
  const config = PROVIDERS[provider];

  if (params.userId) {
    try {
      const { getUserByokKeys } = await import('./a2a/byok.js');
      const keys = await getUserByokKeys(params.userId);
      const field = config.byokField ?? provider;
      const byok = keys[field];
      if (byok) return byok;
    } catch (err) {
      logger.warn({ err, provider }, 'BYOK key lookup failed; falling back to env');
    }
  }

  if (config.keyEnv && process.env[config.keyEnv]) return process.env[config.keyEnv];
  return undefined;
}

function splitSystem(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system');
  return { system, rest };
}

async function callOpenAiCompatible(
  config: ProviderConfig,
  key: string | undefined,
  modelId: string,
  params: ChatCompleteParams,
): Promise<{ content: string; usage?: ChatCompleteResult['usage'] }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;

  const body = {
    model: modelId,
    messages: params.messages,
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
  };

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(params.timeoutMs ?? 120_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`provider returned ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = (await response.json()) as any;
  return {
    content: data?.choices?.[0]?.message?.content ?? '',
    usage: {
      inputTokens: data?.usage?.prompt_tokens,
      outputTokens: data?.usage?.completion_tokens,
    },
  };
}

async function callAnthropic(
  config: ProviderConfig,
  key: string,
  modelId: string,
  params: ChatCompleteParams,
): Promise<{ content: string; usage?: ChatCompleteResult['usage'] }> {
  const { system, rest } = splitSystem(params.messages);
  const body = {
    model: modelId,
    max_tokens: params.maxTokens ?? 4096,
    ...(system ? { system } : {}),
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    messages: rest.map((m) => ({ role: m.role, content: m.content })),
  };
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(params.timeoutMs ?? 120_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`anthropic returned ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = (await response.json()) as any;
  const content = Array.isArray(data?.content)
    ? data.content.map((c: any) => c?.text ?? '').join('')
    : '';
  return {
    content,
    usage: { inputTokens: data?.usage?.input_tokens, outputTokens: data?.usage?.output_tokens },
  };
}

export async function chatComplete(params: ChatCompleteParams): Promise<ChatCompleteResult> {
  const { provider, modelId } = parseModel(params.model, params.provider);
  const config = PROVIDERS[provider];

  if (!config.baseUrl) {
    return { ok: false, provider, model: modelId, error: `provider '${provider}' has no base URL configured` };
  }
  if (!Array.isArray(params.messages) || params.messages.length === 0) {
    return { ok: false, provider, model: modelId, error: 'messages must be a non-empty array' };
  }

  const key = await resolveKey(provider, params);
  if (config.keyRequired && !key) {
    return { ok: false, provider, model: modelId, error: `no API key for '${provider}' (pass apiKey, configure BYOK, or set ${config.keyEnv})` };
  }

  try {
    const result =
      config.style === 'anthropic'
        ? await callAnthropic(config, key!, modelId, params)
        : await callOpenAiCompatible(config, key, modelId, params);

    return { ok: true, provider, model: modelId, content: result.content, usage: result.usage };
  } catch (err) {
    logger.error({ err, provider, model: modelId }, 'chatComplete failed');
    return { ok: false, provider, model: modelId, error: err instanceof Error ? err.message : 'chat completion failed' };
  }
}

export interface ProviderStatus {
  provider: KnownProvider;
  baseUrl: string;
  keyRequired: boolean;
  keyEnvPresent: boolean;
  style: 'openai' | 'anthropic';
  aliases: string[];
}

export function listProviders(): ProviderStatus[] {
  const aliasesByProvider: Record<string, string[]> = {};
  for (const [alias, target] of Object.entries(PROVIDER_ALIASES)) {
    (aliasesByProvider[target] ??= []).push(alias);
  }
  return (Object.keys(PROVIDERS) as KnownProvider[]).map((provider) => {
    const config = PROVIDERS[provider];
    return {
      provider,
      baseUrl: config.baseUrl,
      keyRequired: config.keyRequired,
      keyEnvPresent: !!(config.keyEnv && process.env[config.keyEnv]),
      style: config.style,
      aliases: aliasesByProvider[provider] ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// Complexity-based model routing (inspired by openfang's tiered model config)
// ---------------------------------------------------------------------------

export type ComplexityTier = 'simple' | 'medium' | 'complex';

// Cheap → mid → strong model per provider. Overridable via env LLM_TIER_<PROVIDER>_<TIER>.
const TIER_MODELS: Partial<Record<KnownProvider, Record<ComplexityTier, string>>> = {
  openrouter: { simple: 'openai/gpt-4o-mini', medium: 'openai/gpt-4o', complex: 'anthropic/claude-3-5-sonnet' },
  openai: { simple: 'gpt-4o-mini', medium: 'gpt-4o', complex: 'gpt-4o' },
  anthropic: { simple: 'claude-3-5-haiku-latest', medium: 'claude-3-5-sonnet-latest', complex: 'claude-3-5-sonnet-latest' },
  google: { simple: 'gemini-2.0-flash', medium: 'gemini-2.0-flash', complex: 'gemini-1.5-pro' },
  groq: { simple: 'llama-3.1-8b-instant', medium: 'llama-3.3-70b-versatile', complex: 'llama-3.3-70b-versatile' },
  deepseek: { simple: 'deepseek-chat', medium: 'deepseek-chat', complex: 'deepseek-reasoner' },
};

const SIMPLE_MAX_TOKENS = Number(process.env.LLM_SIMPLE_THRESHOLD) || 400;
const COMPLEX_MIN_TOKENS = Number(process.env.LLM_COMPLEX_THRESHOLD) || 2000;

/** Rough token estimate (~4 chars/token) — no tokenizer dependency. */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

export function classifyComplexity(text: string): ComplexityTier {
  const tokens = estimateTokens(text);
  // Signals beyond length: multi-step / reasoning keywords bump complexity.
  const hard = /\b(architect|refactor|design|debug|why|trade-?off|optimi[sz]e|migrate|prove|analy[sz]e)\b/i.test(text);
  if (tokens >= COMPLEX_MIN_TOKENS || (hard && tokens > SIMPLE_MAX_TOKENS)) return 'complex';
  if (tokens <= SIMPLE_MAX_TOKENS && !hard) return 'simple';
  return 'medium';
}

export interface ModelRecommendation {
  provider: KnownProvider;
  model: string;
  complexity: ComplexityTier;
  estimatedTokens: number;
  reasoning: string;
}

/**
 * Recommend a provider/model for a prompt by estimated complexity — cheaper
 * models for simple tasks, stronger for complex. Prefers a provider that has a
 * configured key; falls back to openrouter.
 */
export function recommendModel(params: { prompt: string; provider?: string }): ModelRecommendation {
  const complexity = classifyComplexity(params.prompt);
  const estimatedTokens = estimateTokens(params.prompt);

  // Pick a provider: explicit → first with a configured key + tier table → openrouter.
  let provider: KnownProvider | undefined;
  if (params.provider) {
    const resolved = (PROVIDER_ALIASES[params.provider.toLowerCase()] ?? params.provider.toLowerCase()) as KnownProvider;
    if (resolved in TIER_MODELS) provider = resolved;
  }
  if (!provider) {
    provider = (Object.keys(TIER_MODELS) as KnownProvider[]).find((p) => {
      const cfg = PROVIDERS[p];
      return !cfg.keyRequired || (cfg.keyEnv && process.env[cfg.keyEnv]);
    });
  }
  if (!provider) provider = 'openrouter';

  const envOverride = process.env[`LLM_TIER_${provider.toUpperCase()}_${complexity.toUpperCase()}`];
  const model = envOverride || TIER_MODELS[provider]?.[complexity] || 'openai/gpt-4o-mini';

  return {
    provider,
    model,
    complexity,
    estimatedTokens,
    reasoning: `~${estimatedTokens} tokens → ${complexity}; routed to ${provider}/${model}`,
  };
}

export function llmRouterHealth(): { available: boolean; providers: number; configured: number } {
  const providers = listProviders();
  return {
    available: true,
    providers: providers.length,
    configured: providers.filter((p) => !p.keyRequired || p.keyEnvPresent).length,
  };
}
