/**
 * Codex model / profile selection — fused from `ts/oh-my-codex/src/config/models.ts`.
 *
 * Faithful merge (not a thin wrapper): the original read overrides from
 * `~/.codex/.omx-config.json` + `OMX_DEFAULT_*` env vars. We keep the same resolution
 * order but make it (a) injectable (no implicit `process.env`/`codexHome()` coupling, so
 * tests stay deterministic and offline) and (b) bounded to what the driver actually needs:
 * pick the model passed to `codex exec --model`.
 *
 * Resolution: explicit override > task metadata (`codexModel`) > `.omx-config.json`
 * `models.default` > `OMX_DEFAULT_FRONTIER_MODEL` env > `DEFAULT_FRONTIER_MODEL`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_FRONTIER_MODEL = 'gpt-5.4';
export const DEFAULT_STANDARD_MODEL = 'gpt-5.4-mini';
export const DEFAULT_SPARK_MODEL = 'gpt-5.3-codex-spark';

export const OMX_DEFAULT_FRONTIER_MODEL_ENV = 'OMX_DEFAULT_FRONTIER_MODEL';
export const OMX_DEFAULT_STANDARD_MODEL_ENV = 'OMX_DEFAULT_STANDARD_MODEL';

export type CodexModelsConfig = Record<string, string | undefined>;

type OmxConfigFile = {
  env?: Record<string, string | undefined>;
  models?: CodexModelsConfig;
};

export type ResolveCodexModelInput = {
  /** Hard override (e.g. RuntimeConfig or task metadata.codexModel). Wins if present. */
  override?: string;
  /** Environment to read OMX_DEFAULT_* from (defaults to process.env). */
  env?: Record<string, string | undefined>;
  /** Codex home dir (defaults to ~/.codex). Injectable for tests. */
  codexHome?: string;
  /** Mode key to look up in `models` (defaults to "default"). */
  mode?: string;
};

function normalize(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function defaultCodexHome(env: Record<string, string | undefined>): string {
  return normalize(env['CODEX_HOME']) ?? join(homedir(), '.codex');
}

function readOmxConfigFile(codexHomeDir: string): OmxConfigFile | null {
  const configPath = join(codexHomeDir, '.omx-config.json');
  if (!existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as OmxConfigFile;
  } catch {
    return null;
  }
}

function readModelsBlock(config: OmxConfigFile | null): CodexModelsConfig | null {
  if (!config?.models || typeof config.models !== 'object' || Array.isArray(config.models)) {
    return null;
  }
  return config.models;
}

function readConfigEnvValue(config: OmxConfigFile | null, key: string): string | undefined {
  if (!config?.env || typeof config.env !== 'object' || Array.isArray(config.env)) {
    return undefined;
  }
  return normalize(config.env[key]);
}

/**
 * Resolve the model name to hand to `codex exec --model`.
 * Mirrors `getModelForMode` from the original, with injected env/home.
 */
export function resolveCodexModel(input: ResolveCodexModelInput = {}): string {
  const override = normalize(input.override);
  if (override) return override;

  const env = input.env ?? process.env;
  const codexHomeDir = input.codexHome ?? defaultCodexHome(env);
  const config = readOmxConfigFile(codexHomeDir);
  const models = readModelsBlock(config);
  const mode = input.mode ?? 'default';

  const modeValue = normalize(models?.[mode]);
  if (modeValue) return modeValue;

  const defaultValue = normalize(models?.['default']);
  if (defaultValue) return defaultValue;

  const envConfigured =
    normalize(env[OMX_DEFAULT_FRONTIER_MODEL_ENV]) ??
    readConfigEnvValue(config, OMX_DEFAULT_FRONTIER_MODEL_ENV);
  return envConfigured ?? DEFAULT_FRONTIER_MODEL;
}

/**
 * Codex reasoning effort knob, surfaced so the driver can pass `-c reasoning_effort=...`.
 * The OMX default is `high`; callers may override via task metadata.
 */
export type CodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export function resolveReasoningEffort(value: unknown): CodexReasoningEffort {
  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return 'high';
}
