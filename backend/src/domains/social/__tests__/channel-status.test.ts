/**
 * `channel-status` read models — TRUTHFUL health shapes for the `/api/social`
 * GET `/` (connectors health per channel) and GET `/channels` reads.
 *
 * Proves the truthfulness contract: disabled ⇒ down with a reason; enabled but
 * unprobeable/unready ⇒ down with the probe's reason; enabled + genuinely ready
 * ⇒ up; discord (foundation-only) is never reported live; no fabricated `up`.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildConnectorsView, buildChannelsView } from '../routes/channel-status.js';
import type { ChannelAdapterRegistry, ChannelAdapterStatus } from '../adapters/channel-adapter-registry.js';
import type { SocialConfig, ChannelConfig } from '../config.js';
import { CHANNEL_IDS, type ChannelId } from '../types.js';

/** A hostile-by-default SocialConfig fixture (all channels off unless overridden). */
function testConfig(overrides: Partial<Record<ChannelId, ChannelConfig>> = {}): SocialConfig {
  const channels = {} as Record<ChannelId, ChannelConfig>;
  for (const id of CHANNEL_IDS) channels[id] = overrides[id] ?? { enabled: false, secretRef: null };
  return {
    isProduction: false,
    channels,
    requireMention: true,
    allowlist: [],
    ingressSecret: null,
    zrok: { enabled: false, shareName: null },
  };
}

/** A registry fake whose `statuses` returns the given probe results. */
function fakeRegistry(statuses: readonly ChannelAdapterStatus[]): {
  registry: ChannelAdapterRegistry;
  statusesSpy: ReturnType<typeof vi.fn>;
} {
  const statusesSpy = vi.fn(async () => statuses);
  const registry = {
    get: vi.fn(async () => null),
    send: vi.fn(async () => ({ delivered: false, messageIds: [] })),
    statuses: statusesSpy,
  } as unknown as ChannelAdapterRegistry;
  return { registry, statusesSpy };
}

describe('buildConnectorsView — GET / connectors health per channel', () => {
  it('no channels configured ⇒ every channel down with a reason, not degraded, no probes', async () => {
    const { registry, statusesSpy } = fakeRegistry([]);
    const view = await buildConnectorsView(testConfig(), registry);

    expect(view.connectors).toHaveLength(CHANNEL_IDS.length);
    for (const c of view.connectors) {
      expect(c.status).toBe('down');
      expect(c.configured).toBe(false);
      expect(c.reason).toContain('not configured');
    }
    // Nothing enabled ⇒ nothing to be degraded about, and no live probes run.
    expect(view.degraded).toBe(false);
    expect(statusesSpy).not.toHaveBeenCalled();
  });

  it('enabled channel with a ready probe ⇒ up; disabled peers stay down', async () => {
    const { registry } = fakeRegistry([
      { channel: 'telegram', bound: true, configured: true, ready: true },
    ]);
    const config = testConfig({ telegram: { enabled: true, secretRef: 'vault:tg' } });
    const view = await buildConnectorsView(config, registry);

    const telegram = view.connectors.find((c) => c.channel === 'telegram');
    expect(telegram).toEqual({ channel: 'telegram', status: 'up', configured: true });
    const slack = view.connectors.find((c) => c.channel === 'slack');
    expect(slack?.status).toBe('down');
    expect(view.degraded).toBe(false);
  });

  it('enabled channel whose probe is not ready ⇒ down with the probe reason, degraded', async () => {
    const { registry } = fakeRegistry([
      { channel: 'slack', bound: true, configured: false, ready: false, reason: 'channel enabled but secret not configured' },
    ]);
    const config = testConfig({ slack: { enabled: true, secretRef: null } });
    const view = await buildConnectorsView(config, registry);

    const slack = view.connectors.find((c) => c.channel === 'slack');
    expect(slack?.status).toBe('down');
    expect(slack?.reason).toBe('channel enabled but secret not configured');
    expect(view.degraded).toBe(true);
  });

  it('enabled channel with no probe result ⇒ down (probe unavailable), never faked up', async () => {
    const { registry } = fakeRegistry([]);
    const config = testConfig({ line: { enabled: true, secretRef: 'vault:line' } });
    const view = await buildConnectorsView(config, registry);

    const line = view.connectors.find((c) => c.channel === 'line');
    expect(line?.status).toBe('down');
    expect(line?.reason).toContain('probe unavailable');
    expect(view.degraded).toBe(true);
  });

  it('discord enabled ⇒ down (foundation-only, no live runtime), degraded', async () => {
    const { registry, statusesSpy } = fakeRegistry([]);
    const config = testConfig({ discord: { enabled: true, secretRef: 'vault:discord' } });
    const view = await buildConnectorsView(config, registry);

    const discord = view.connectors.find((c) => c.channel === 'discord');
    expect(discord?.status).toBe('down');
    expect(discord?.reason).toContain('no live runtime');
    expect(view.degraded).toBe(true);
    // Discord is never live-probed.
    expect(statusesSpy).not.toHaveBeenCalled();
  });
});

describe('buildChannelsView — GET /channels listing', () => {
  it('disabled channels list enabled:false with a reason', () => {
    const rows = buildChannelsView(testConfig());
    expect(rows).toHaveLength(CHANNEL_IDS.length);
    for (const row of rows) {
      expect(row.enabled).toBe(false);
      expect(row.hasSecretRef).toBe(false);
      expect(row.reason).toContain('not configured');
    }
  });

  it('enabled live channel with a secret ref carries no reason', () => {
    const rows = buildChannelsView(testConfig({ telegram: { enabled: true, secretRef: 'vault:tg' } }));
    const telegram = rows.find((r) => r.channel === 'telegram');
    expect(telegram).toEqual({ channel: 'telegram', live: true, enabled: true, hasSecretRef: true });
  });

  it('enabled live channel without a secret ref is truthfully flagged', () => {
    const rows = buildChannelsView(testConfig({ whatsapp: { enabled: true, secretRef: null } }));
    const whatsapp = rows.find((r) => r.channel === 'whatsapp');
    expect(whatsapp?.enabled).toBe(true);
    expect(whatsapp?.hasSecretRef).toBe(false);
    expect(whatsapp?.reason).toContain('no secret reference');
  });

  it('discord is marked live:false with a foundation-only reason even when enabled', () => {
    const rows = buildChannelsView(testConfig({ discord: { enabled: true, secretRef: 'vault:d' } }));
    const discord = rows.find((r) => r.channel === 'discord');
    expect(discord?.live).toBe(false);
    expect(discord?.enabled).toBe(true);
    expect(discord?.reason).toContain('no live runtime');
  });
});
