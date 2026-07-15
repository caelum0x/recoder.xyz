/**
 * `live-health` — augments the config-derived {@link buildSocialHealth} with LIVE
 * channel-adapter probes. The static health tells you which channels are enabled +
 * have a secret ref; this adds whether each live channel's ConnectorPort actually
 * resolved and is genuinely reachable — never a faked `up`.
 *
 * Degrade-safe: probing runs only for enabled channels and each probe is bounded
 * by the registry's own fail-safe (`ready:false` with a reason on any fault).
 */
import type { ComponentHealth, EngineStatus } from '../../shared/health-types.js';
import { degraded, healthy } from '../../shared/health-types.js';
import type { SocialConfig } from './config.js';
import type { ChannelAdapterRegistry } from './adapters/channel-adapter-registry.js';
import { CHANNEL_IDS, isLiveChannel, type ChannelId } from './types.js';

const NAME = 'social';

/** The live channels currently enabled in config. */
function enabledLiveChannels(config: SocialConfig): ChannelId[] {
  return CHANNEL_IDS.filter((id) => config.channels[id]?.enabled && isLiveChannel(id));
}

/** Build truthful social health including live ConnectorPort probes. */
export async function buildLiveSocialHealth(
  config: SocialConfig,
  channels: ChannelAdapterRegistry,
): Promise<ComponentHealth> {
  const enabled = enabledLiveChannels(config);
  if (enabled.length === 0) {
    // Inert but healthy: no channels configured is a valid, truthful `up`.
    return { ...healthy(NAME), engines: [] };
  }

  const statuses = await channels.statuses(enabled);
  const engines: EngineStatus[] = statuses.map((s) => ({
    name: s.channel,
    status: s.ready ? 'up' : 'down',
    ...(s.ready ? {} : { reason: s.reason ?? 'channel not ready' }),
  }));

  const anyDown = engines.some((e) => e.status !== 'up');
  if (anyDown) {
    return degraded(NAME, 'one or more enabled channels are not reachable', engines);
  }
  return { ...healthy(NAME), engines };
}
