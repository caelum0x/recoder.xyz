/**
 * Bridges the model layer to `@recoder/pi-ai` at the pi CLI boundary.
 *
 * The pi CLI owns model resolution, provider auth, and the `@recoder/pi-ai` registry
 * internally; the driver's job is to translate the runtime's task/policy/env into the
 * `--provider`/`--model`/`--api-key` arguments pi understands, and to surface BYOK keys so
 * pi's `@recoder/pi-ai` auth layer can pick them up. We resolve provider/model from explicit
 * task metadata first, then fall back to pi's own `PI_*` env-driven selection.
 *
 * This mirrors `packages/pi-coding-agent/src/main.ts` `buildSessionOptions` / `--api-key`
 * handling, without re-implementing pi's bootstrap.
 */

import type { RuntimeTaskInput } from '@recoder/agent-runtimes';

export type PiModelSelection = {
  provider?: string;
  model?: string;
  /** BYOK key value to pass via `--api-key` (only valid alongside an explicit model). */
  apiKey?: string;
};

/** pi-ai provider env keys, used as a fallback signal that a provider is configured. */
const PROVIDER_ENV_HINTS: Readonly<Record<string, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
};

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Resolve the pi model selection from task metadata + child env.
 *
 * Precedence:
 *  1. `task.metadata.runtime.pi.{provider,model}` (explicit task pin).
 *  2. `task.metadata.model` / `task.metadata.provider` (generic pins).
 *  3. pi env-driven defaults (`PI_PROVIDER`/`PI_MODEL`), left to the CLI when unset.
 */
export function resolvePiModel(
  input: RuntimeTaskInput,
  env: Readonly<Record<string, string>>,
): PiModelSelection {
  const metadata = (input.task.metadata ?? {}) as Record<string, unknown>;
  const runtimeMeta = metadata['runtime'] as Record<string, unknown> | undefined;
  const piMeta = runtimeMeta?.['pi'] as Record<string, unknown> | undefined;

  const provider =
    readString(piMeta, 'provider') ??
    readString(metadata, 'provider') ??
    readString(env, 'PI_PROVIDER');

  const model =
    readString(piMeta, 'model') ??
    readString(metadata, 'model') ??
    readString(env, 'PI_MODEL');

  // BYOK key, if a provider+model is pinned and a key is present in the scoped env.
  const apiKey =
    provider && model
      ? readString(piMeta, 'apiKey') ?? providerKeyFromEnv(provider, env)
      : undefined;

  return { provider, model, apiKey };
}

function providerKeyFromEnv(
  provider: string,
  env: Readonly<Record<string, string>>,
): string | undefined {
  const envKey = PROVIDER_ENV_HINTS[provider.toLowerCase()];
  return envKey ? readString(env, envKey) : undefined;
}
