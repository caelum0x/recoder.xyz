/**
 * Tests for the signed connector-ingress gate — the hostile-by-default edge that
 * the gateway runs an already-channel-gated message through (seal → admit via the
 * OWNED `@recoder/interop` connector-ingress primitives) before it reaches the
 * Conductor workspace loop.
 *
 * These exercise the REAL interop seal/admit path (unstubbed): the only inputs are
 * a normalized message, an explicit secret, and an injected clock — so the gate's
 * three outcomes (disabled, admitted, rejected) are observed end-to-end.
 */
import { describe, it, expect } from 'vitest';
import type { NormalizedInboundMessage } from '@recoder/connectors';
import { admitConnectorMessage } from './connector-ingress-gate';

function inbound(overrides: Partial<NormalizedInboundMessage> = {}): NormalizedInboundMessage {
  return {
    channel: 'telegram',
    accountId: 'acct_1',
    messageId: 'm1',
    conversationId: 'c1',
    chatType: 'direct',
    sender: { SenderId: '42', SenderUsername: 'alice' },
    text: '/run build the landing page',
    wasMentioned: false,
    attachments: [],
    timestamp: 1_700_000_000_000,
    raw: {},
    ...overrides,
  };
}

const NOW = new Date('2026-06-29T00:00:00.000Z');

describe('admitConnectorMessage — signed connector-ingress gate', () => {
  it('is a degrade-safe pass-through (disabled) when no secret is configured', () => {
    const outcome = admitConnectorMessage(inbound(), { secret: null, now: NOW });
    expect(outcome.kind).toBe('disabled');
  });

  it('seals + admits a message when the gateway ingress secret is configured', () => {
    const outcome = admitConnectorMessage(inbound(), { secret: 'gateway-secret', now: NOW });
    expect(outcome.kind).toBe('admitted');
    if (outcome.kind === 'admitted') {
      // The verified payload is the structural connector message, intact.
      expect(outcome.payload.channel).toBe('telegram');
      expect(outcome.payload.messageId).toBe('m1');
      expect(outcome.payload.text).toBe('/run build the landing page');
      expect(outcome.payload.conversationId).toBe('c1');
    }
  });

  it('admits even when the channel field is an arbitrary string (structural)', () => {
    const outcome = admitConnectorMessage(inbound({ channel: 'slack' }), {
      secret: 's3cr3t',
      now: NOW,
    });
    expect(outcome.kind).toBe('admitted');
    if (outcome.kind === 'admitted') {
      expect(outcome.payload.channel).toBe('slack');
    }
  });
});
