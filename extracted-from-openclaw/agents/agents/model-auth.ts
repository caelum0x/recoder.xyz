import { type Api, getEnvApiKey, type Model } from "@mariozechner/pi-ai";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { ModelProviderAuthMode, ModelProviderConfig } from "../config/types.js";
import { formatCliCommand } from "../cli/command-format.js";
import { getShellEnvAppliedKeys } from "../infra/shell-env.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { formatRemainingShort } from "./auth-health.js";
import {
  type AuthProfileStore,
  ensureAuthProfileStore,
  listProfilesForProvider,
  resolveApiKeyForProfile,
  resolveAuthProfileOrder,
  resolveAuthStorePathForDisplay,
  resolveProfileUnusableUntilForDisplay,
} from "./auth-profiles.js";
import { normalizeProviderId } from "./model-selection.js";

const log = createSubsystemLogger("agents/model-auth");

export { ensureAuthProfileStore, resolveAuthProfileOrder } from "./auth-profiles.js";

const AWS_BEARER_ENV = "AWS_BEARER_TOKEN_BEDROCK";
const AWS_ACCESS_KEY_ENV = "AWS_ACCESS_KEY_ID";
const AWS_SECRET_KEY_ENV = "AWS_SECRET_ACCESS_KEY";
const AWS_PROFILE_ENV = "AWS_PROFILE";

function buildErrorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: string | number };
    return {
      errorName: error.name,
      errorMessage: error.message,
      ...(withCode.code !== undefined ? { errorCode: String(withCode.code) } : {}),
    };
  }
  return {
    errorMessage: String(error),
  };
}

function resolveProviderConfig(
  cfg: OpenClawConfig | undefined,
  provider: string,
): ModelProviderConfig | undefined {
  const providers = cfg?.models?.providers ?? {};
  const direct = providers[provider] as ModelProviderConfig | undefined;
  if (direct) {
    return direct;
  }
  const normalized = normalizeProviderId(provider);
  if (normalized === provider) {
    const matched = Object.entries(providers).find(
      ([key]) => normalizeProviderId(key) === normalized,
    );
    return matched?.[1];
  }
  return (
    (providers[normalized] as ModelProviderConfig | undefined) ??
    Object.entries(providers).find(([key]) => normalizeProviderId(key) === normalized)?.[1]
  );
}

export function getCustomProviderApiKey(
  cfg: OpenClawConfig | undefined,
  provider: string,
): string | undefined {
  const entry = resolveProviderConfig(cfg, provider);
  const key = entry?.apiKey?.trim();
  return key || undefined;
}

function resolveProviderAuthOverride(
  cfg: OpenClawConfig | undefined,
  provider: string,
): ModelProviderAuthMode | undefined {
  const entry = resolveProviderConfig(cfg, provider);
  const auth = entry?.auth;
  if (auth === "api-key" || auth === "aws-sdk" || auth === "oauth" || auth === "token") {
    return auth;
  }
  return undefined;
}

function resolveEnvSourceLabel(params: {
  applied: Set<string>;
  envVars: string[];
  label: string;
}): string {
  const shellApplied = params.envVars.some((envVar) => params.applied.has(envVar));
  const prefix = shellApplied ? "shell env: " : "env: ";
  return `${prefix}${params.label}`;
}

export function resolveAwsSdkEnvVarName(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env[AWS_BEARER_ENV]?.trim()) {
    return AWS_BEARER_ENV;
  }
  if (env[AWS_ACCESS_KEY_ENV]?.trim() && env[AWS_SECRET_KEY_ENV]?.trim()) {
    return AWS_ACCESS_KEY_ENV;
  }
  if (env[AWS_PROFILE_ENV]?.trim()) {
    return AWS_PROFILE_ENV;
  }
  return undefined;
}

function resolveAwsSdkAuthInfo(): { mode: "aws-sdk"; source: string } {
  const applied = new Set(getShellEnvAppliedKeys());
  if (process.env[AWS_BEARER_ENV]?.trim()) {
    return {
      mode: "aws-sdk",
      source: resolveEnvSourceLabel({
        applied,
        envVars: [AWS_BEARER_ENV],
        label: AWS_BEARER_ENV,
      }),
    };
  }
  if (process.env[AWS_ACCESS_KEY_ENV]?.trim() && process.env[AWS_SECRET_KEY_ENV]?.trim()) {
    return {
      mode: "aws-sdk",
      source: resolveEnvSourceLabel({
        applied,
        envVars: [AWS_ACCESS_KEY_ENV, AWS_SECRET_KEY_ENV],
        label: `${AWS_ACCESS_KEY_ENV} + ${AWS_SECRET_KEY_ENV}`,
      }),
    };
  }
  if (process.env[AWS_PROFILE_ENV]?.trim()) {
    return {
      mode: "aws-sdk",
      source: resolveEnvSourceLabel({
        applied,
        envVars: [AWS_PROFILE_ENV],
        label: AWS_PROFILE_ENV,
      }),
    };
  }
  return { mode: "aws-sdk", source: "aws-sdk default chain" };
}

function listEnvVarsForProvider(provider: string): string[] {
  const normalized = normalizeProviderId(provider);
  if (normalized === "github-copilot") {
    return ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];
  }
  if (normalized === "anthropic") {
    return ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];
  }
  if (normalized === "chutes") {
    return ["CHUTES_OAUTH_TOKEN", "CHUTES_API_KEY"];
  }
  if (normalized === "zai") {
    return ["ZAI_API_KEY", "Z_AI_API_KEY"];
  }
  if (normalized === "google-vertex") {
    return ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_VERTEX_PROJECT", "GOOGLE_VERTEX_LOCATION"];
  }
  if (normalized === "opencode") {
    return ["OPENCODE_API_KEY", "OPENCODE_ZEN_API_KEY"];
  }
  if (normalized === "qwen-portal") {
    return ["QWEN_OAUTH_TOKEN", "QWEN_PORTAL_API_KEY"];
  }
  if (normalized === "minimax-portal") {
    return ["MINIMAX_OAUTH_TOKEN", "MINIMAX_API_KEY"];
  }
  if (normalized === "kimi-coding") {
    return ["KIMI_API_KEY", "KIMICODE_API_KEY"];
  }
  if (normalized === "amazon-bedrock") {
    return [AWS_BEARER_ENV, AWS_ACCESS_KEY_ENV, AWS_SECRET_KEY_ENV, AWS_PROFILE_ENV];
  }

  const envMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    google: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    deepgram: "DEEPGRAM_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    xai: "XAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
    "cloudflare-ai-gateway": "CLOUDFLARE_AI_GATEWAY_API_KEY",
    moonshot: "MOONSHOT_API_KEY",
    minimax: "MINIMAX_API_KEY",
    xiaomi: "XIAOMI_API_KEY",
    synthetic: "SYNTHETIC_API_KEY",
    venice: "VENICE_API_KEY",
    mistral: "MISTRAL_API_KEY",
    opencode: "OPENCODE_API_KEY",
  };
  const envVar = envMap[normalized];
  return envVar ? [envVar] : [];
}

export type ResolvedProviderAuth = {
  apiKey?: string;
  profileId?: string;
  source: string;
  mode: "api-key" | "oauth" | "token" | "aws-sdk";
};

function describeProviderProfilesForDiagnostics(
  store: AuthProfileStore,
  provider: string,
): string[] {
  const now = Date.now();
  return listProfilesForProvider(store, provider).map((profileId) => {
    const cred = store.profiles[profileId];
    const type = cred?.type ?? "unknown";
    const until = resolveProfileUnusableUntilForDisplay(store, profileId);
    const cooldown =
      typeof until === "number" && until > now
        ? `cooldown:${formatRemainingShort(until - now)}`
        : "ready";
    return `${profileId}(${type},${cooldown})`;
  });
}

export async function resolveApiKeyForProvider(params: {
  provider: string;
  cfg?: OpenClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth> {
  const { provider, cfg, profileId, preferredProfile } = params;
  const store = params.store ?? ensureAuthProfileStore(params.agentDir);

  if (profileId) {
    const resolved = await resolveApiKeyForProfile({
      cfg,
      store,
      profileId,
      agentDir: params.agentDir,
    });
    if (!resolved) {
      const profile = store.profiles[profileId];
      const providerProfiles = profile
        ? describeProviderProfilesForDiagnostics(store, profile.provider)
        : [];
      log.warn("explicit profile auth resolution failed", {
        provider,
        profileId,
        agentDir: params.agentDir ?? null,
        profileExists: Boolean(profile),
        providerProfiles,
      });
      throw new Error(
        [
          `No credentials found for profile "${profileId}".`,
          `Provider profiles: ${providerProfiles.join(", ") || "(none)"}.`,
          `Run ${formatCliCommand("openclaw models auth status")} to inspect auth state.`,
        ].join(" "),
      );
    }
    const mode = store.profiles[profileId]?.type;
    return {
      apiKey: resolved.apiKey,
      profileId,
      source: `profile:${profileId}`,
      mode: mode === "oauth" ? "oauth" : mode === "token" ? "token" : "api-key",
    };
  }

  const authOverride = resolveProviderAuthOverride(cfg, provider);
  if (authOverride === "aws-sdk") {
    return resolveAwsSdkAuthInfo();
  }

  const order = resolveAuthProfileOrder({
    cfg,
    store,
    provider,
    preferredProfile,
  });
  for (const candidate of order) {
    try {
      const resolved = await resolveApiKeyForProfile({
        cfg,
        store,
        profileId: candidate,
        agentDir: params.agentDir,
      });
      if (resolved) {
        const mode = store.profiles[candidate]?.type;
        return {
          apiKey: resolved.apiKey,
          profileId: candidate,
          source: `profile:${candidate}`,
          mode: mode === "oauth" ? "oauth" : mode === "token" ? "token" : "api-key",
        };
      }
    } catch (err) {
      log.debug("profile resolution failed", {
        provider,
        profileId: candidate,
        agentDir: params.agentDir ?? null,
        ...buildErrorFields(err),
      });
    }
  }

  const envResolved = resolveEnvApiKey(provider);
  if (envResolved) {
    return {
      apiKey: envResolved.apiKey,
      source: envResolved.source,
      mode: envResolved.source.includes("OAUTH_TOKEN") ? "oauth" : "api-key",
    };
  }

  const customKey = getCustomProviderApiKey(cfg, provider);
  if (customKey) {
    return { apiKey: customKey, source: "models.json", mode: "api-key" };
  }

  const normalized = normalizeProviderId(provider);
  if (authOverride === undefined && normalized === "amazon-bedrock") {
    return resolveAwsSdkAuthInfo();
  }

  if (provider === "openai") {
    const hasCodex = listProfilesForProvider(store, "openai-codex").length > 0;
    if (hasCodex) {
      const codexProfiles = describeProviderProfilesForDiagnostics(store, "openai-codex");
      log.warn("openai provider requested but only codex oauth profiles available", {
        provider,
        codexProfiles,
        authStorePath: resolveAuthStorePathForDisplay(params.agentDir),
      });
      throw new Error(
        [
          'No API key found for provider "openai". You are authenticated with OpenAI Codex OAuth.',
          "Use openai-codex/gpt-5.2 (ChatGPT OAuth) or set OPENAI_API_KEY for openai/gpt-5.2.",
          `Codex profiles: ${codexProfiles.join(", ") || "(none)"}.`,
        ].join(" "),
      );
    }
  }

  const authStorePath = resolveAuthStorePathForDisplay(params.agentDir);
  const resolvedAgentDir = path.dirname(authStorePath);
  const envStatus = listEnvVarsForProvider(provider).map((envVar) => ({
    envVar,
    present: Boolean(process.env[envVar]?.trim()),
  }));
  const providerProfiles = describeProviderProfilesForDiagnostics(store, provider);

  // Build diagnostic context for the error message
  const now = Date.now();
  const cooldownInfo = order
    .map((id) => {
      const until = resolveProfileUnusableUntilForDisplay(store, id);
      if (!until || now >= until) {
        return null;
      }
      return `${id} (cooldown: ${formatRemainingShort(until - now)})`;
    })
    .filter(Boolean);

  const parts = [
    `No API key found for provider "${provider}".`,
    `Profiles tried: [${order.join(", ")}].`,
  ];
  if (cooldownInfo.length > 0) {
    parts.push(`In cooldown: [${cooldownInfo.join(", ")}].`);
  }
  parts.push(
    `Auth store: ${authStorePath} (agentDir: ${resolvedAgentDir}).`,
    `Configure auth for this agent (${formatCliCommand("openclaw agents add <id>")}) or copy auth-profiles.json from the main agentDir.`,
  );
  if (envStatus.length > 0) {
    parts.push(
      `Env checked: ${envStatus
        .map((entry) => `${entry.envVar}=${entry.present ? "set" : "missing"}`)
        .join(", ")}.`,
    );
  }
  log.warn("provider auth resolution exhausted all sources", {
    provider,
    normalizedProvider: normalized,
    authOverride: authOverride ?? null,
    requestedProfileId: profileId ?? null,
    preferredProfile: preferredProfile ?? null,
    attemptedProfiles: order,
    providerProfiles,
    cooldownProfiles: cooldownInfo,
    envStatus,
    authStorePath,
    resolvedAgentDir,
  });
  throw new Error(parts.join(" "));
}

export type EnvApiKeyResult = { apiKey: string; source: string };
export type ModelAuthMode = "api-key" | "oauth" | "token" | "mixed" | "aws-sdk" | "unknown";

export function resolveEnvApiKey(provider: string): EnvApiKeyResult | null {
  const normalized = normalizeProviderId(provider);
  const applied = new Set(getShellEnvAppliedKeys());
  const pick = (envVar: string): EnvApiKeyResult | null => {
    const value = process.env[envVar]?.trim();
    if (!value) {
      return null;
    }
    const source = applied.has(envVar) ? `shell env: ${envVar}` : `env: ${envVar}`;
    return { apiKey: value, source };
  };

  if (normalized === "github-copilot") {
    return pick("COPILOT_GITHUB_TOKEN") ?? pick("GH_TOKEN") ?? pick("GITHUB_TOKEN");
  }

  if (normalized === "anthropic") {
    return pick("ANTHROPIC_OAUTH_TOKEN") ?? pick("ANTHROPIC_API_KEY");
  }

  if (normalized === "chutes") {
    return pick("CHUTES_OAUTH_TOKEN") ?? pick("CHUTES_API_KEY");
  }

  if (normalized === "zai") {
    return pick("ZAI_API_KEY") ?? pick("Z_AI_API_KEY");
  }

  if (normalized === "google-vertex") {
    const envKey = getEnvApiKey(normalized);
    if (!envKey) {
      return null;
    }
    return { apiKey: envKey, source: "gcloud adc" };
  }

  if (normalized === "opencode") {
    return pick("OPENCODE_API_KEY") ?? pick("OPENCODE_ZEN_API_KEY");
  }

  if (normalized === "qwen-portal") {
    return pick("QWEN_OAUTH_TOKEN") ?? pick("QWEN_PORTAL_API_KEY");
  }

  if (normalized === "minimax-portal") {
    return pick("MINIMAX_OAUTH_TOKEN") ?? pick("MINIMAX_API_KEY");
  }

  if (normalized === "kimi-coding") {
    return pick("KIMI_API_KEY") ?? pick("KIMICODE_API_KEY");
  }

  const envMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    google: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    deepgram: "DEEPGRAM_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    xai: "XAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
    "cloudflare-ai-gateway": "CLOUDFLARE_AI_GATEWAY_API_KEY",
    moonshot: "MOONSHOT_API_KEY",
    minimax: "MINIMAX_API_KEY",
    xiaomi: "XIAOMI_API_KEY",
    synthetic: "SYNTHETIC_API_KEY",
    venice: "VENICE_API_KEY",
    mistral: "MISTRAL_API_KEY",
    opencode: "OPENCODE_API_KEY",
  };
  const envVar = envMap[normalized];
  if (!envVar) {
    return null;
  }
  return pick(envVar);
}

export function resolveModelAuthMode(
  provider?: string,
  cfg?: OpenClawConfig,
  store?: AuthProfileStore,
): ModelAuthMode | undefined {
  const resolved = provider?.trim();
  if (!resolved) {
    return undefined;
  }

  const authOverride = resolveProviderAuthOverride(cfg, resolved);
  if (authOverride === "aws-sdk") {
    return "aws-sdk";
  }

  const authStore = store ?? ensureAuthProfileStore();
  const profiles = listProfilesForProvider(authStore, resolved);
  if (profiles.length > 0) {
    const modes = new Set(
      profiles
        .map((id) => authStore.profiles[id]?.type)
        .filter((mode): mode is "api_key" | "oauth" | "token" => Boolean(mode)),
    );
    const distinct = ["oauth", "token", "api_key"].filter((k) =>
      modes.has(k as "oauth" | "token" | "api_key"),
    );
    if (distinct.length >= 2) {
      return "mixed";
    }
    if (modes.has("oauth")) {
      return "oauth";
    }
    if (modes.has("token")) {
      return "token";
    }
    if (modes.has("api_key")) {
      return "api-key";
    }
  }

  if (authOverride === undefined && normalizeProviderId(resolved) === "amazon-bedrock") {
    return "aws-sdk";
  }

  const envKey = resolveEnvApiKey(resolved);
  if (envKey?.apiKey) {
    return envKey.source.includes("OAUTH_TOKEN") ? "oauth" : "api-key";
  }

  if (getCustomProviderApiKey(cfg, resolved)) {
    return "api-key";
  }

  return "unknown";
}

export async function getApiKeyForModel(params: {
  model: Model<Api>;
  cfg?: OpenClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth> {
  return resolveApiKeyForProvider({
    provider: params.model.provider,
    cfg: params.cfg,
    profileId: params.profileId,
    preferredProfile: params.preferredProfile,
    store: params.store,
    agentDir: params.agentDir,
  });
}

export function requireApiKey(auth: ResolvedProviderAuth, provider: string): string {
  const key = auth.apiKey?.trim();
  if (key) {
    return key;
  }
  throw new Error(`No API key resolved for provider "${provider}" (auth mode: ${auth.mode}).`);
}
