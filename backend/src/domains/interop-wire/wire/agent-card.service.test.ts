/**
 * `agent-card.service` capability tests — the local card advertises the
 * spec-shaped `wireCapabilities` object (`{ streaming: true, … }`) reflecting the
 * wired `message/stream` support, and remote cards are coerced structurally
 * (never fabricating a `true` flag).
 */
import { describe, it, expect } from 'vitest';
import {
  createAgentCardService,
  DEFAULT_WIRE_CAPABILITIES,
  type RemoteCardFetcher,
} from './agent-card.service.js';

const LOCAL = { id: 'inst-1', name: 'recoder', capabilities: ['a2a'] } as const;

describe('agent-card local capabilities', () => {
  it('advertises the spec-shaped capabilities object with streaming enabled', () => {
    const card = createAgentCardService(LOCAL, { fetcher: null }).getLocalAgentCard();
    expect(card.wireCapabilities).toEqual({
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    });
    // The default constant and the emitted object agree (single source of truth).
    expect(card.wireCapabilities).toEqual(DEFAULT_WIRE_CAPABILITIES);
  });

  it('preserves the legacy capabilities string list unchanged (additive, no break)', () => {
    const card = createAgentCardService(LOCAL, { fetcher: null }).getLocalAgentCard();
    expect(card.capabilities).toEqual(['a2a']);
  });

  it('honours a bootstrap override of the capabilities object', () => {
    const card = createAgentCardService(
      { ...LOCAL, wireCapabilities: { streaming: false, pushNotifications: true, stateTransitionHistory: false } },
      { fetcher: null },
    ).getLocalAgentCard();
    expect(card.wireCapabilities).toEqual({ streaming: false, pushNotifications: true, stateTransitionHistory: false });
  });
});

describe('agent-card remote capabilities coercion', () => {
  function fetcherOf(raw: unknown): RemoteCardFetcher {
    return { fetch: async () => raw };
  }

  it('coerces a well-formed remote capabilities object (strict boolean flags)', async () => {
    const svc = createAgentCardService(LOCAL, {
      fetcher: fetcherOf({
        id: 'remote-1',
        name: 'peer',
        capabilities: ['a2a'],
        wireCapabilities: { streaming: true, pushNotifications: 'yes', stateTransitionHistory: true },
      }),
    });
    const card = await svc.resolveRemoteCard('ref-1');
    // A non-`true` flag (`'yes'`) coerces to `false` — never fabricated `true`.
    expect(card?.wireCapabilities).toEqual({ streaming: true, pushNotifications: false, stateTransitionHistory: true });
  });

  it('omits wireCapabilities on a remote card that never advertised one', async () => {
    const svc = createAgentCardService(LOCAL, {
      fetcher: fetcherOf({ id: 'remote-2', name: 'peer', capabilities: [] }),
    });
    const card = await svc.resolveRemoteCard('ref-2');
    expect(card).not.toBeNull();
    expect(card?.wireCapabilities).toBeUndefined();
  });
});
