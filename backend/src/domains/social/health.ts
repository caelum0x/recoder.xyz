/**
 * Social truthful health. Per-channel up|down aggregation → `HealthReport`-style
 * `ComponentHealth`. Doctrine (domain doc §9):
 *   - no channel configured ⇒ `up`, degraded:false, engines:[] (inert but healthy);
 *   - channel enabled but secret missing ⇒ that engine `down`, module `degraded`;
 *   - never a faked `up`.
 */
import type { ComponentHealth, EngineStatus } from '../../shared/health-types.js';
import { degraded, healthy } from '../../shared/health-types.js';
import type { SocialConfig } from './config.js';
import { CHANNEL_IDS, isLiveChannel } from './types.js';

const NAME = 'social';

/** Build the truthful social component health from the resolved config. */
export function buildSocialHealth(config: SocialConfig): ComponentHealth {
  const engines: EngineStatus[] = [];
  let anyEnabled = false;
  let anyDown = false;

  for (const id of CHANNEL_IDS) {
    const channel = config.channels[id];
    if (!channel?.enabled) continue; // not configured ⇒ not an engine
    if (!isLiveChannel(id)) continue; // discord is a dormant foundation adapter
    anyEnabled = true;
    const up = Boolean(channel.secretRef);
    if (!up) anyDown = true;
    engines.push({
      name: id,
      status: up ? 'up' : 'down',
      reason: up ? undefined : 'channel enabled but secret not configured',
    });
  }

  if (!anyEnabled) {
    // Inert but healthy: no channels configured is a valid, truthful `up`.
    return { ...healthy(NAME), engines: [] };
  }
  if (anyDown) {
    return degraded(NAME, 'one or more enabled channels are missing their secret', engines);
  }
  return { ...healthy(NAME), engines };
}
