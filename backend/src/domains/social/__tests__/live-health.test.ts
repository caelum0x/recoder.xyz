/**
 * `live-health` — truthful social health that augments config with LIVE
 * ConnectorPort probes. These tests lock the SLO-truthfulness invariants:
 *   - no enabled live channel ⇒ inert-but-honest `up` with empty engines
 *     (a non-live channel like discord never fabricates a probe);
 *   - all enabled channels reachable ⇒ `up` with each engine `up`;
 *   - ANY enabled channel not ready ⇒ `degraded` (never a faked `up`), and the
 *     channel's own reason is surfaced (falling back to a truthful default);
 *   - only the enabled live channels are probed (the exact set is passed through).
 *
 * The channel registry is an injected fake — no gateway, no network.
 */
import { describe, it, expect } from 'vitest';
import { buildLiveSocialHealth } from '../live-health.js';
import type { SocialConfig, ChannelConfig } from '../config.js';
import type {
  ChannelAdapterRegistry,
  ChannelAdapterStatus,
} from '../adapters/channel-adapter-registry.js';
import { CHANNEL_IDS, type ChannelId } from '../types.js';
import type { OutboundMessage, SendResult } from '../ports/connector-port.js';

function makeConfig(enabledChannels: readonly ChannelId[]): SocialConfig {
  const channels = {} as Record<ChannelId, ChannelConfig>;
  for (const id of CHANNEL_IDS) {
    channels[id] = { enabled: enabledChannels.includes(id), secretRef: enabledChannels.includes(id) ? 'ref' : null };
  }
  return {
    isProduction: false,
    channels,
    requireMention: true,
    allowlist: [],
    ingressSecret: null,
    zrok: { enabled: false, shareName: null },
  };
}

function makeChannels(
  statuses: readonly ChannelAdapterStatus[],
  spy?: { enabledArgs: ChannelId[][] },
): ChannelAdapterRegistry {
  return {
    async get() {
      return null;
    },
    async send(_channel: ChannelId, _message: OutboundMessage): Promise<SendResult> {
      return { delivered: false, messageIds: [] };
    },
    async statuses(enabled: readonly ChannelId[]) {
      spy?.enabledArgs.push([...enabled]);
      return statuses;
    },
  };
}

describe('live-health truthfulness', () => {
  it('no enabled live channel ⇒ inert-but-honest up with no engines and no probe', async () => {
    const spy = { enabledArgs: [] as ChannelId[][] };
    const health = await buildLiveSocialHealth(makeConfig([]), makeChannels([], spy));

    expect(health.status).toBe('up');
    expect(health.degraded).toBe(false);
    expect(health.engines).toEqual([]);
    // With nothing enabled, the registry is never probed.
    expect(spy.enabledArgs).toHaveLength(0);
  });

  it('a non-live channel (discord) enabled does NOT fabricate a live probe', async () => {
    const spy = { enabledArgs: [] as ChannelId[][] };
    // discord is a foundation channel but NOT in the live set.
    const health = await buildLiveSocialHealth(makeConfig(['discord']), makeChannels([], spy));

    expect(health.status).toBe('up');
    expect(health.engines).toEqual([]);
    expect(spy.enabledArgs).toHaveLength(0);
  });

  it('all enabled live channels reachable ⇒ up with each engine up', async () => {
    const spy = { enabledArgs: [] as ChannelId[][] };
    const statuses: ChannelAdapterStatus[] = [
      { channel: 'telegram', bound: true, configured: true, ready: true },
      { channel: 'slack', bound: true, configured: true, ready: true },
    ];
    const health = await buildLiveSocialHealth(
      makeConfig(['telegram', 'slack']),
      makeChannels(statuses, spy),
    );

    expect(health.status).toBe('up');
    expect(health.degraded).toBe(false);
    expect(health.engines).toEqual([
      { name: 'telegram', status: 'up' },
      { name: 'slack', status: 'up' },
    ]);
    // Exactly the enabled live channels are probed.
    expect(spy.enabledArgs[0]).toEqual(['telegram', 'slack']);
  });

  it('NEVER FAKES UP: any unready channel ⇒ degraded, surfacing the channel reason', async () => {
    const statuses: ChannelAdapterStatus[] = [
      { channel: 'telegram', bound: true, configured: true, ready: true },
      { channel: 'slack', bound: true, configured: true, ready: false, reason: 'token revoked' },
    ];
    const health = await buildLiveSocialHealth(
      makeConfig(['telegram', 'slack']),
      makeChannels(statuses),
    );

    expect(health.status).toBe('degraded');
    expect(health.degraded).toBe(true);
    expect(health.reason).toMatch(/not reachable/i);
    expect(health.engines).toEqual([
      { name: 'telegram', status: 'up' },
      { name: 'slack', status: 'down', reason: 'token revoked' },
    ]);
  });

  it('an unready channel with no reason still reports a truthful default reason', async () => {
    const statuses: ChannelAdapterStatus[] = [
      { channel: 'line', bound: false, configured: false, ready: false },
    ];
    const health = await buildLiveSocialHealth(makeConfig(['line']), makeChannels(statuses));

    expect(health.status).toBe('degraded');
    expect(health.engines?.[0]).toEqual({ name: 'line', status: 'down', reason: 'channel not ready' });
  });
});
