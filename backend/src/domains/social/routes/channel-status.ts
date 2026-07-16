/**
 * Read models for the health-shaped `/api/social` reads:
 *
 *   GET /          → {@link buildConnectorsView}  — connectors health per channel
 *   GET /channels  → {@link buildChannelsView}    — configured channels + reason
 *
 * TRUTHFUL by construction: a disabled channel is reported `down` with a reason
 * (never omitted, never faked `up`); an enabled channel is only `up` when its
 * live ConnectorPort probe genuinely succeeds. No fabricated connections.
 */
import type { SocialConfig } from '../config.js';
import type { ChannelAdapterRegistry, ChannelAdapterStatus } from '../adapters/channel-adapter-registry.js';
import { CHANNEL_IDS, isLiveChannel, type ChannelHealth, type ChannelId } from '../types.js';

/** One row of the GET /channels listing. */
export interface ChannelListing {
  readonly channel: ChannelId;
  /** Whether the channel is in the LIVE set (discord is foundation-only). */
  readonly live: boolean;
  /** Explicitly turned on in config. */
  readonly enabled: boolean;
  /** A vault secret REFERENCE is configured (never the secret itself). */
  readonly hasSecretRef: boolean;
  /** Why the channel is not fully operational; absent when nothing is missing. */
  readonly reason?: string;
}

/** The GET / read model: truthful per-channel connector health. */
export interface ConnectorsView {
  readonly connectors: readonly ChannelHealth[];
  /** True when at least one ENABLED channel is not `up`. */
  readonly degraded: boolean;
}

const REASON_DISABLED = 'channel not configured (disabled)';
const REASON_NOT_LIVE = 'channel has no live runtime (foundation adapter only)';
const REASON_NO_SECRET_REF = 'channel enabled but no secret reference configured';
const REASON_PROBE_UNAVAILABLE = 'channel probe unavailable';

/** Health of one channel derived from config posture + an optional live probe. */
function channelHealthOf(
  id: ChannelId,
  config: SocialConfig,
  probe: ChannelAdapterStatus | undefined,
): ChannelHealth {
  const channelConfig = config.channels[id];
  if (!channelConfig?.enabled) {
    return { channel: id, status: 'down', configured: false, reason: REASON_DISABLED };
  }
  const configured = Boolean(channelConfig.secretRef);
  if (!isLiveChannel(id)) {
    return { channel: id, status: 'down', configured, reason: REASON_NOT_LIVE };
  }
  if (!probe) {
    return { channel: id, status: 'down', configured, reason: REASON_PROBE_UNAVAILABLE };
  }
  return {
    channel: id,
    status: probe.ready ? 'up' : 'down',
    configured: probe.configured,
    ...(probe.ready ? {} : { reason: probe.reason ?? 'channel not ready' }),
  };
}

/** Build the GET / connectors-health read model (probes enabled live channels). */
export async function buildConnectorsView(
  config: SocialConfig,
  channels: ChannelAdapterRegistry,
): Promise<ConnectorsView> {
  const enabledLive = CHANNEL_IDS.filter((id) => config.channels[id]?.enabled && isLiveChannel(id));
  const probes = enabledLive.length > 0 ? await channels.statuses(enabledLive) : [];
  const probeByChannel = new Map(probes.map((p) => [p.channel, p] as const));

  const connectors = CHANNEL_IDS.map((id) => channelHealthOf(id, config, probeByChannel.get(id)));
  const degraded = connectors.some(
    (c) => config.channels[c.channel]?.enabled === true && c.status !== 'up',
  );
  return { connectors, degraded };
}

/** Build the GET /channels listing: truthful enabled/disabled + reason. */
export function buildChannelsView(config: SocialConfig): readonly ChannelListing[] {
  return CHANNEL_IDS.map((id) => {
    const channelConfig = config.channels[id];
    const enabled = Boolean(channelConfig?.enabled);
    const hasSecretRef = Boolean(channelConfig?.secretRef);
    const live = isLiveChannel(id);
    const reason = !enabled
      ? REASON_DISABLED
      : !live
        ? REASON_NOT_LIVE
        : !hasSecretRef
          ? REASON_NO_SECRET_REF
          : undefined;
    return { channel: id, live, enabled, hasSecretRef, ...(reason ? { reason } : {}) };
  });
}
