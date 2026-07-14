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
import { SUPPORTED_CHANNELS, getChannelAdapter } from './channel-adapters.js';

/** Per-channel resolved configuration for a channel whose credentials are present. */
export interface ChannelConfig {
  readonly channel: ConnectorKind;
  /** Bot/account credential (telegram bot token, etc.). Never logged. */
  readonly token: string;
  /** Connector account id this credential authenticates as. */
  readonly accountId: string;
  /**
   * True when this configured channel still needs an external dependency (HTTP
   * webhook ingress, bridge/daemon) to take inbound LIVE. Surfaced truthfully in
   * health so the operator knows config alone is not enough for this channel.
   */
  readonly requiresExternal: boolean;
  /** Human-readable note when `requiresExternal` (what dependency is missing). */
  readonly note?: string;
}

/**
 * A channel whose credentials are NOT present — reported truthfully in health as
 * configured:false with the reason (which env var is missing), and NOT
 * registered (it never contacts a network or fakes a connection).
 */
export interface UnconfiguredChannel {
  readonly channel: ConnectorKind;
  readonly reason: string;
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
  /** Channels whose credentials are present — registered + monitored. */
  readonly channels: readonly ChannelConfig[];
  /** Channels with no credentials — reported configured:false, never registered. */
  readonly unconfigured: readonly UnconfiguredChannel[];
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

/** Channels with a real adapter implementation in this bridge (the seven subpaths). */
const REAL_CHANNELS: readonly ConnectorKind[] = SUPPORTED_CHANNELS;

interface ResolvedChannels {
  readonly channels: ChannelConfig[];
  readonly unconfigured: UnconfiguredChannel[];
}

function resolveChannels(): ResolvedChannels {
  // Operator may pin the enabled set via CONNECTORS_CHANNELS; otherwise every
  // channel that has a real adapter is a candidate and per-channel credential
  // detection (delegated to the adapter descriptor) decides configured-or-not.
  const requested = splitList(readConnectorEnv('CHANNELS') ?? process.env.CONNECTORS_CHANNELS)
    .filter((c): c is ConnectorKind => isConnectorKind(c));
  const candidates = requested.length > 0 ? requested.filter((c) => REAL_CHANNELS.includes(c)) : REAL_CHANNELS;

  const channels: ChannelConfig[] = [];
  const unconfigured: UnconfiguredChannel[] = [];
  for (const channel of candidates) {
    const adapter = getChannelAdapter(channel);
    if (!adapter) continue; // no real adapter -> not a candidate (defensive)
    const detection = adapter.detect();
    if (!detection.configured || !detection.token) {
      // No credentials -> truthful configured:false, NOT registered, never faked.
      unconfigured.push({ channel, reason: detection.reason ?? 'not configured' });
      continue;
    }
    channels.push({
      channel,
      token: detection.token,
      accountId: detection.accountId ?? channel,
      requiresExternal: adapter.requiresExternal,
      note: adapter.requiresExternal ? detection.reason : undefined,
    });
  }
  return { channels, unconfigured };
}

/** Resolve the full connectors config from the current environment. */
export function loadConnectorsConfig(): ConnectorsConfig {
  const { channels, unconfigured } = resolveChannels();
  return {
    channels,
    unconfigured,
    dispatch: resolveDispatch(),
    gating: resolveGating(),
  };
}
