// Owned by Recoder. The raw gateway imported `../config/config.js` /
// `../../config/config.js` for the loaded gateway config (`loadConfig()` →
// `OpenClawConfig`). That config sibling was not part of the extraction. This is
// the real, dependency-free loader: it reads the JSON config file pointed to by
// the connectors config-path env (`RECODER_CONNECTORS_CONFIG_PATH`, legacy
// `OPENCLAW_CONFIG_PATH`), parses + memoizes it, and degrades to an empty config
// when the file is absent or unreadable (the gateway then falls back to env
// tokens / default routing). `OpenClawConfig` describes the fields the extracted
// Discord code reads, with an index signature for the rest of the surface.

import { readFileSync } from "node:fs";
import { resolveConfigPath } from "../../src/identity.js";
import type { DiscordChannelConfig } from "./types.js";

/** Routing config for a single agent. */
export interface AgentRouteConfig {
  id: string;
  bindings?: Array<{
    channel?: string;
    accountId?: string;
    guildId?: string;
    peerKind?: string;
    peerId?: string;
  }>;
  [key: string]: unknown;
}

/** Session-store config. */
export interface SessionConfig {
  store?: string;
  [key: string]: unknown;
}

/**
 * Logging config surface the extracted infra/logging code consumes. Only the
 * sensitive-text redaction knobs are typed; the rest of the logging surface is
 * carried by the index signature.
 */
export interface LoggingConfig {
  /** Sensitive-text redaction mode. "off" disables redaction; anything else
   * (default) redacts tokens/keys/secrets before they reach logs/errors. */
  redactSensitive?: string;
  /** Optional custom redaction patterns (raw `/re/flags` or bare regex source). */
  redactPatterns?: string[];
  [key: string]: unknown;
}

/** The loaded gateway config surface the extracted Discord code consumes. */
export interface OpenClawConfig {
  channels?: {
    discord?: DiscordChannelConfig;
    [channel: string]: unknown;
  };
  session?: SessionConfig;
  /** Logging config (redaction knobs consumed by the extracted infra/logging). */
  logging?: LoggingConfig;
  /** Configured agents, keyed by agent id (or a list of route configs). */
  agents?: Record<string, AgentRouteConfig> | AgentRouteConfig[];
  /** Agent id used when no binding matches an inbound route. */
  defaultAgent?: string;
  [key: string]: unknown;
}

const EMPTY_CONFIG: OpenClawConfig = {};

let cachedConfig: OpenClawConfig | undefined;
let cachedConfigPath: string | undefined;

function parseConfigFile(path: string): OpenClawConfig {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as OpenClawConfig;
    }
    return EMPTY_CONFIG;
  } catch {
    // Missing / unreadable / malformed config → empty config. The gateway then
    // relies on env tokens and default routing rather than crashing on boot.
    return EMPTY_CONFIG;
  }
}

/**
 * Load the gateway config, memoized per resolved config path. When no config
 * path is set (or the file cannot be read), returns an empty config so callers
 * can degrade to environment-driven behavior.
 */
export function loadConfig(): OpenClawConfig {
  const path = resolveConfigPath();
  if (!path) {
    return EMPTY_CONFIG;
  }
  if (cachedConfig && cachedConfigPath === path) {
    return cachedConfig;
  }
  cachedConfig = parseConfigFile(path);
  cachedConfigPath = path;
  return cachedConfig;
}

/** Test-only reset of the memoized config. */
export function __resetConfigForTest(): void {
  cachedConfig = undefined;
  cachedConfigPath = undefined;
}
