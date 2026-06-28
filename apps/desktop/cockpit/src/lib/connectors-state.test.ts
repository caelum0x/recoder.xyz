/**
 * Unit tests for the connectors presentation helpers (connectors-state.ts).
 *
 * These exercise the pure status-derivation over the REAL ChannelHealth shape
 * returned by GET /api/connectors. No mocks: each case asserts the honest status
 * chip for a concrete probe result.
 */
import { describe, expect, it } from 'vitest';
import {
  channelReason,
  channelStatus,
  channelStatusLabel,
  channelStatusTone,
  summarizeChannels,
  type ChannelStatus,
} from './connectors-state';
import type { ChannelHealth } from '../types';

function ch(partial: Partial<ChannelHealth>): ChannelHealth {
  return {
    channel: 'telegram',
    configured: false,
    connected: false,
    ...partial,
  };
}

describe('channelStatus', () => {
  it("is 'live' only when a real probe reported connected", () => {
    expect(channelStatus(ch({ configured: true, connected: true }))).toBe('live');
  });

  it("is 'live' even if requiresExternal is set — a real connected probe wins", () => {
    expect(channelStatus(ch({ configured: true, connected: true, requiresExternal: true }))).toBe('live');
  });

  it("is 'unconfigured' when no credentials are present", () => {
    expect(channelStatus(ch({ configured: false, connected: false }))).toBe('unconfigured');
  });

  it("is 'requires-external' when configured but needs an out-of-process dependency", () => {
    expect(channelStatus(ch({ configured: true, connected: false, requiresExternal: true }))).toBe('requires-external');
  });

  it("is 'config-only' when configured, not connected, and no external dependency", () => {
    expect(channelStatus(ch({ configured: true, connected: false, requiresExternal: false }))).toBe('config-only');
  });

  it('never reports live without connected: true', () => {
    expect(channelStatus(ch({ configured: true, connected: false }))).not.toBe('live');
  });
});

describe('channelStatusLabel', () => {
  it('maps each status to its human label', () => {
    const labels: Record<ChannelStatus, string> = {
      live: 'live',
      'requires-external': 'requires external',
      'config-only': 'config only',
      unconfigured: 'unconfigured',
    };
    for (const [status, label] of Object.entries(labels)) {
      expect(channelStatusLabel(status as ChannelStatus)).toBe(label);
    }
  });
});

describe('channelStatusTone', () => {
  it('maps live -> good, requires-external -> warn, config-only -> progress, unconfigured -> neutral', () => {
    expect(channelStatusTone('live')).toBe('good');
    expect(channelStatusTone('requires-external')).toBe('warn');
    expect(channelStatusTone('config-only')).toBe('progress');
    expect(channelStatusTone('unconfigured')).toBe('neutral');
  });
});

describe('channelReason', () => {
  it('surfaces a probe error verbatim, regardless of status', () => {
    expect(channelReason(ch({ configured: true, connected: true, error: 'rate limited' }))).toBe('rate limited');
  });

  it('returns undefined for a live channel with no error', () => {
    expect(channelReason(ch({ configured: true, connected: true }))).toBeUndefined();
  });

  it("returns the gateway reason for an unconfigured channel", () => {
    expect(channelReason(ch({ configured: false, connected: false, reason: 'CONNECTORS_SLACK_TOKEN not set' }))).toBe(
      'CONNECTORS_SLACK_TOKEN not set',
    );
  });

  it('returns the missing-dependency reason for a requires-external channel', () => {
    expect(
      channelReason(ch({ configured: true, connected: false, requiresExternal: true, reason: 'needs @slack/bolt' })),
    ).toBe('needs @slack/bolt');
  });

  it('returns undefined when a non-live channel has no reason and no error', () => {
    expect(channelReason(ch({ configured: true, connected: false }))).toBeUndefined();
  });
});

describe('summarizeChannels', () => {
  it('counts each channel by its derived status', () => {
    const channels: ChannelHealth[] = [
      ch({ channel: 'telegram', configured: true, connected: true }),
      ch({ channel: 'slack', configured: true, connected: false, requiresExternal: true }),
      ch({ channel: 'discord', configured: true, connected: false }),
      ch({ channel: 'whatsapp', configured: false, connected: false }),
      ch({ channel: 'teams', configured: false, connected: false }),
    ];
    expect(summarizeChannels(channels)).toEqual({
      live: 1,
      'requires-external': 1,
      'config-only': 1,
      unconfigured: 2,
    });
  });

  it('returns an all-zero summary for an empty channel list', () => {
    expect(summarizeChannels([])).toEqual({
      live: 0,
      'requires-external': 0,
      'config-only': 0,
      unconfigured: 0,
    });
  });
});
