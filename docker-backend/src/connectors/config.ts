/**
 * Connectors bridge config — read enabled channels, tokens, allowlist, and the
 * dispatch defaults from the environment. Truthful + degrade-safe: a channel is
 * "configured" only when its credential env var is genuinely present, and a
 * channel with no token is simply not enabled (never a fake "connected").
 *
 * This is the boundary that turns untrusted env into a typed config the gateway
 * trusts. Nothing here contacts a channel — that is the connector's job.
 */
import { type ConnectorKind, isConnectorKind, readConnectorEnv } from '@recoder/connectors';
import { isConductorRuntimeId, type ConductorRuntimeId } from '../conductor/runtime-commands.js';

/** Per-channel resolved configuration (currently telegram is the real adapter). */
export interface ChannelConfig {
  readonly channel: ConnectorKind;
  /** Bot/account credential (telegram bot token, etc.). Never logged. */
  readonly token: string;
  /** Connector account id this credential authenticates as. */
  readonly accountId: string;
}

/** Resolved dispatch defaults applied when an inbound command omits them. */
export interface DispatchConfig {
  /** Absolute git repo path a workspace branches its worktree from. */
  readonly repoPath: string;
  /** Conductor runtime that drives the agent (claude_code, codex, …). */
  readonly runtimeId: ConductorRuntimeId;
  readonly spaceId: string;
  readonly projectId: string;
  /** Optional model override passed to the runtime CLI. */
  readonly model?: string;
}

/** Trust-boundary config: who may invoke + whether a mention is required. */
export interface GatingConfig {
  /**
   * Allowlist of channel-native sender ids / usernames. A literal "*" means
   * allow-all (explicit opt-in only). Empty + no wildcard => nobody is allowed
   * (hostile-by-default: an unconfigured allowlist drops every message).
   */
  readonly allowlist: readonly string[];
  /** Require an explicit @mention before acting in a group/channel. */
  readonly requireMention: boolean;
}

export interface ConnectorsConfig {
  readonly channels: readonly ChannelConfig[];
  readonly dispatch: DispatchConfig | undefined;
  readonly gating: GatingConfig;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function resolveRuntimeId(): ConductorRuntimeId {
  const raw = (readConnectorEnv('RUNTIME_ID') ?? process.env.CONNECTORS_RUNTIME_ID ?? 'claude_code').trim();
  return isConductorRuntimeId(raw) ? raw : 'claude_code';
}

function resolveDispatch(): DispatchConfig | undefined {
  // CONNECTORS_REPO_PATH is the one hard requirement for dispatch: without a
  // real repo to branch from, an inbound command cannot launch an agent. When
  // absent we keep the gateway inbound-only-inert rather than guessing a path.
  const repoPath = (readConnectorEnv('REPO_PATH') ?? process.env.CONNECTORS_REPO_PATH ?? '').trim();
  if (!repoPath) return undefined;
  const model = (readConnectorEnv('MODEL') ?? process.env.CONNECTORS_MODEL ?? '').trim();
  return {
    repoPath,
    runtimeId: resolveRuntimeId(),
    spaceId: (readConnectorEnv('SPACE_ID') ?? process.env.CONNECTORS_SPACE_ID ?? 'default').trim() || 'default',
    projectId: (readConnectorEnv('PROJECT_ID') ?? process.env.CONNECTORS_PROJECT_ID ?? 'connectors').trim() || 'connectors',
    model: model || undefined,
  };
}

function resolveGating(): GatingConfig {
  const allowlist = splitList(readConnectorEnv('ALLOWLIST') ?? process.env.CONNECTORS_ALLOWLIST);
  const requireMentionRaw = (readConnectorEnv('REQUIRE_MENTION') ?? process.env.CONNECTORS_REQUIRE_MENTION ?? 'true')
    .trim()
    .toLowerCase();
  return {
    allowlist,
    requireMention: requireMentionRaw !== 'false' && requireMentionRaw !== '0',
  };
}

/** Channels with a real adapter implementation in this bridge. */
const REAL_CHANNELS: readonly ConnectorKind[] = ['telegram'];

/** Per-channel credential env name (only real adapters need to be resolvable). */
function tokenEnvFor(channel: ConnectorKind): string | undefined {
  switch (channel) {
    case 'telegram':
      // RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN / OPENCLAW_TELEGRAM_BOT_TOKEN, or
      // the plain TELEGRAM_BOT_TOKEN that operators expect.
      return readConnectorEnv('TELEGRAM_BOT_TOKEN') ?? process.env.TELEGRAM_BOT_TOKEN;
    default:
      return undefined;
  }
}

function resolveChannels(): ChannelConfig[] {
  // Operator may pin the enabled set via CONNECTORS_CHANNELS; otherwise we
  // attempt every channel that has a real adapter and let token presence decide.
  const requested = splitList(readConnectorEnv('CHANNELS') ?? process.env.CONNECTORS_CHANNELS)
    .filter((c): c is ConnectorKind => isConnectorKind(c));
  const candidates = requested.length > 0 ? requested : REAL_CHANNELS;

  const channels: ChannelConfig[] = [];
  for (const channel of candidates) {
    if (!REAL_CHANNELS.includes(channel)) continue; // no real adapter -> not enabled
    const token = tokenEnvFor(channel)?.trim();
    if (!token) continue; // no token -> not configured -> degrade-safe skip
    channels.push({
      channel,
      token,
      accountId: (readConnectorEnv(`${channel.toUpperCase()}_ACCOUNT_ID`) ?? channel).trim() || channel,
    });
  }
  return channels;
}

/** Resolve the full connectors config from the current environment. */
export function loadConnectorsConfig(): ConnectorsConfig {
  return {
    channels: resolveChannels(),
    dispatch: resolveDispatch(),
    gating: resolveGating(),
  };
}
