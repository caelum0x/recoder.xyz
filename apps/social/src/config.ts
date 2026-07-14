/**
 * recoder-social config — env-driven, no secrets in code, truthful defaults.
 *
 * Reuses the CONNECTORS_* env surface the backend connectors bridge
 * already defines (with RECODER_CONNECTORS_* / OPENCLAW_* prefixes honored via
 * the package's readConnectorEnv) so an operator configures ONE env vocabulary
 * regardless of which runtime hosts the connectors. App-only knobs (the status
 * HTTP listener) use SOCIAL_*.
 *
 * Hostile-by-default: an empty CONNECTORS_ALLOWLIST authorizes NOBODY (every
 * inbound message is dropped at the trust boundary), and mention gating in
 * groups defaults to ON.
 */
import { isConnectorKind, readConnectorEnv, type ConnectorKind } from '@recoder/connectors';

/** Status/health HTTP listener config. */
export interface SocialHttpConfig {
  /** Bind host. Defaults to 127.0.0.1 (never exposed publicly by default). */
  readonly host: string;
  /** Bind port. Defaults to 7391. 0 = ephemeral (tests). */
  readonly port: number;
}

/** Trust-boundary config: who may invoke + whether a mention is required. */
export interface SocialGatingConfig {
  /**
   * Allowlist of channel-native sender ids / usernames. Literal "*" is an
   * explicit allow-all opt-in. Empty => nobody is authorized (every message is
   * truthfully blocked).
   */
  readonly allowlist: readonly string[];
  /** Require an explicit @mention before acting in a group/channel. */
  readonly requireMention: boolean;
}

/** Embedded reply-agent config (optional pi peers; opt-in). */
export interface SocialAgentConfig {
  /** Opt-in flag (CONNECTORS_AGENT_ENABLED). Without it: truthful no-runner. */
  readonly enabled: boolean;
  /** Logical agent id for reply turns. */
  readonly agentId: string;
  /** Optional model override for the embedded runner. */
  readonly model?: string;
}

export interface SocialConfig {
  readonly http: SocialHttpConfig;
  readonly gating: SocialGatingConfig;
  readonly agent: SocialAgentConfig;
  /**
   * Channels the operator pinned via CONNECTORS_CHANNELS (comma-separated).
   * Empty = every channel with a real adapter is a candidate; per-channel
   * credential detection decides configured-or-not truthfully.
   */
  readonly channelFilter: readonly ConnectorKind[];
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Read a connectors env var: RECODER_CONNECTORS_/OPENCLAW_ prefix, then plain. */
function readEnv(name: string): string | undefined {
  const prefixed = readConnectorEnv(name);
  if (prefixed !== undefined && prefixed.trim() !== '') return prefixed.trim();
  const plain = process.env[`CONNECTORS_${name}`];
  if (plain !== undefined && plain.trim() !== '') return plain.trim();
  return undefined;
}

function resolvePort(): number {
  const raw = (process.env['SOCIAL_PORT'] ?? '').trim();
  if (!raw) return 7391;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    // Fail fast with a clear message instead of listening somewhere surprising.
    throw new Error(`SOCIAL_PORT must be an integer in [0, 65535], got "${raw}"`);
  }
  return port;
}

function resolveFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return defaultValue;
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/** Resolve the full social-app config from the current environment. */
export function loadSocialConfig(): SocialConfig {
  const model = readEnv('AGENT_MODEL');
  return {
    http: {
      host: (process.env['SOCIAL_HOST'] ?? '').trim() || '127.0.0.1',
      port: resolvePort(),
    },
    gating: {
      allowlist: splitList(readEnv('ALLOWLIST')),
      requireMention: resolveFlag(readEnv('REQUIRE_MENTION'), true),
    },
    agent: {
      enabled: resolveFlag(readEnv('AGENT_ENABLED'), false),
      agentId: readEnv('AGENT_ID') ?? 'connector-reply',
      ...(model ? { model } : {}),
    },
    channelFilter: splitList(readEnv('CHANNELS')).filter(isConnectorKind),
  };
}
