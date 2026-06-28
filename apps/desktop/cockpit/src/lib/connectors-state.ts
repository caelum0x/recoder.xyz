/**
 * Connectors presentation helpers — pure functions that derive a TRUTHFUL
 * per-channel status chip from the real GET /api/connectors shape. Nothing here
 * fabricates a "connected" state: each status is a direct read of the probe
 * result the gateway reported.
 *
 * Source of truth for the contract:
 *  - docker-backend/src/connectors/gateway.ts (ChannelHealth)
 *  - docker-backend/src/connectors/index.ts (config-derived inert snapshot)
 *
 * The four honest statuses, in precedence order:
 *  - 'live'             : configured AND a real probe reported connected.
 *  - 'requires-external': configured but needs an out-of-process dependency
 *                         (SDK / bridge / webhook) before it can connect.
 *  - 'config-only'      : configured (credentials present) but not yet connected.
 *  - 'unconfigured'     : no credentials present — the channel is inert.
 */
import type { ChannelHealth } from '../types';

export type ChannelStatus = 'live' | 'requires-external' | 'config-only' | 'unconfigured';

/**
 * Derive the single honest status for a channel. Precedence is deliberate:
 * a real `connected` probe always wins ('live'); otherwise an unconfigured
 * channel is 'unconfigured'; a configured channel that still needs an external
 * dependency is 'requires-external'; everything else configured-but-not-connected
 * is 'config-only'. We never report 'live' without a real `connected: true`.
 */
export function channelStatus(ch: Pick<ChannelHealth, 'configured' | 'connected' | 'requiresExternal'>): ChannelStatus {
  if (ch.connected) return 'live';
  if (!ch.configured) return 'unconfigured';
  if (ch.requiresExternal) return 'requires-external';
  return 'config-only';
}

/** Human label for a channel status (what the chip text reads). */
export function channelStatusLabel(status: ChannelStatus): string {
  switch (status) {
    case 'live':
      return 'live';
    case 'requires-external':
      return 'requires external';
    case 'config-only':
      return 'config only';
    case 'unconfigured':
      return 'unconfigured';
    default:
      return status;
  }
}

/** Map a channel status to a styles.css tone-* class. */
export function channelStatusTone(status: ChannelStatus): string {
  switch (status) {
    case 'live':
      return 'good';
    case 'requires-external':
      return 'warn';
    case 'config-only':
      return 'progress';
    case 'unconfigured':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/**
 * The truthful reason to show alongside a non-live chip. When NOT configured the
 * gateway carries the "why" in `reason`; when it requires an external dependency
 * `reason` names the missing dependency; a probe `error` is surfaced verbatim.
 * Returns undefined when there is genuinely nothing to add (e.g. a live channel).
 */
export function channelReason(ch: Pick<ChannelHealth, 'configured' | 'connected' | 'requiresExternal' | 'reason' | 'error'>): string | undefined {
  if (ch.error) return ch.error;
  const status = channelStatus(ch);
  if (status === 'live') return undefined;
  return ch.reason || undefined;
}

/**
 * Count channels by their derived status — a truthful summary header
 * ("2 live / 3 config only / 2 unconfigured") over the real channel list.
 */
export function summarizeChannels(channels: ReadonlyArray<ChannelHealth>): Record<ChannelStatus, number> {
  const counts: Record<ChannelStatus, number> = {
    live: 0,
    'requires-external': 0,
    'config-only': 0,
    unconfigured: 0,
  };
  for (const ch of channels) {
    counts[channelStatus(ch)] += 1;
  }
  return counts;
}
