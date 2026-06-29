/**
 * Discord — the eighth backend channel.
 *
 * What is REAL here (not stubbed):
 *   - The REAL `@recoder/connectors/discord` adapter subpath is imported and its
 *     `createDiscordConnector` builds a genuine `DiscordConnector` whose
 *     `normalize()` is the real Discord gateway-event -> NormalizedInboundMessage
 *     conversion.
 *   - The REAL config detector (`loadConnectorsConfig` -> the discord
 *     `ChannelAdapter.detect()`) reads `DISCORD_BOT_TOKEN` from the env and
 *     reports configured/unconfigured truthfully.
 *   - The REAL gateway-WS ingress seam (`registerDiscordEventSource`) drives the
 *     adapter's `monitor()`: with NO source the adapter throws a truthful "ingress
 *     not configured" error (degrade-safe, no fake gateway); with a source wired,
 *     monitor() subscribes and a normalized event flows through.
 *
 * No fake success: a configured-but-source-less discord is configured + truthful
 * `requiresExternal`, never a faked running gateway.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDiscordConnector } from '@recoder/connectors/discord';
import type { NormalizedInboundMessage } from '@recoder/connectors';
import { loadConnectorsConfig } from './config';
import { SUPPORTED_CHANNELS, getChannelAdapter } from './channel-adapters';
import {
  registerDiscordEventSource,
  resolveDiscordEventSource,
  hasDiscordEventSource,
} from './discord-event-source';

const ENV_KEYS = [
  'CONNECTORS_CHANNELS',
  'DISCORD_BOT_TOKEN',
  'DISCORD_ACCOUNT_ID',
  'RECODER_CONNECTORS_DISCORD_BOT_TOKEN',
  'OPENCLAW_DISCORD_BOT_TOKEN',
];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('discord — registered as the eighth backend channel', () => {
  it('is in SUPPORTED_CHANNELS and has a real adapter descriptor', () => {
    expect(SUPPORTED_CHANNELS).toContain('discord');
    const adapter = getChannelAdapter('discord');
    expect(adapter).toBeTruthy();
    // Discord inbound is gateway-WS only -> live inbound needs an external source.
    expect(adapter!.requiresExternal).toBe(true);
  });

  it('detect(): without DISCORD_BOT_TOKEN, discord is unconfigured with a truthful reason', () => {
    const config = loadConnectorsConfig();
    expect(config.channels.some((c) => c.channel === 'discord')).toBe(false);
    const discord = config.unconfigured.find((u) => u.channel === 'discord');
    expect(discord).toBeTruthy();
    expect(discord!.reason).toMatch(/DISCORD_BOT_TOKEN/);
  });

  it('detect(): with DISCORD_BOT_TOKEN, discord is configured + marked requiresExternal (needs a gateway-WS source)', () => {
    process.env.DISCORD_BOT_TOKEN = 'discord-bot-token';
    const config = loadConnectorsConfig();
    const discord = config.channels.find((c) => c.channel === 'discord');
    expect(discord).toBeTruthy();
    expect(discord!.token).toBe('discord-bot-token');
    expect(discord!.requiresExternal).toBe(true);
    expect(discord!.note).toMatch(/gateway-WS|event source/i);
  });
});

describe('discord adapter — real ConnectorPort over the subpath', () => {
  it('create() builds a real port whose normalize() converts a Discord gateway event', async () => {
    process.env.DISCORD_BOT_TOKEN = 'discord-bot-token';
    const adapter = getChannelAdapter('discord')!;
    const port = await adapter.create({ configured: true, token: 'discord-bot-token', accountId: 'discord' });
    expect(port.kind).toBe('discord');

    const event = {
      message: {
        id: 'm1',
        channelId: 'c1',
        content: 'hello agent',
        channelType: 1, // DM
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      author: { id: 'u1', username: 'alice', bot: false },
    };
    const normalized = port.normalize(event, 'discord');
    expect(normalized).toBeTruthy();
    expect(normalized!.channel).toBe('discord');
    expect(normalized!.text).toBe('hello agent');
    expect(normalized!.chatType).toBe('direct');
    expect(normalized!.sender.SenderId).toBe('u1');
  });

  it('monitor() throws a truthful "ingress" error when NO gateway-WS event source is wired (degrade-safe, no fake gateway)', async () => {
    expect(hasDiscordEventSource()).toBe(false);
    const port = createDiscordConnector({ config: { token: 'discord-bot-token' } });
    // No event source -> monitor must surface a real, actionable error, never a
    // fake live loop. (It throws before any network call because eventSource is
    // the first gate inside monitor() after binding the account.)
    await expect(port.monitor('default', async () => {})).rejects.toThrow(/event source|ingress/i);
  });
});

describe('discord gateway-WS event source seam', () => {
  it('registerDiscordEventSource wires a host source and resolve returns it; unregister restores inert', () => {
    expect(resolveDiscordEventSource()).toBeUndefined();
    let subscribed = false;
    const restore = registerDiscordEventSource(() => ({
      subscribe: async (_accountId, _onEvent) => {
        subscribed = true;
        return { unsubscribe: () => {} };
      },
    }));
    expect(hasDiscordEventSource()).toBe(true);
    const source = resolveDiscordEventSource();
    expect(source).toBeTruthy();
    // The resolved source is the real host source — subscribing flips our flag.
    void source!.subscribe('default', () => {});
    expect(subscribed).toBe(true);

    restore();
    expect(hasDiscordEventSource()).toBe(false);
    expect(resolveDiscordEventSource()).toBeUndefined();
  });

  it('with a wired source, the discord adapter monitor() subscribes and delivers a normalized event', async () => {
    process.env.DISCORD_BOT_TOKEN = 'discord-bot-token';
    // A host gateway-WS source that immediately pushes one MessageCreate event.
    let pushed: ((event: unknown) => void | Promise<void>) | null = null;
    const restore = registerDiscordEventSource(() => ({
      subscribe: async (_accountId, onEvent) => {
        pushed = onEvent;
        return { unsubscribe: () => {} };
      },
    }));
    try {
      // Build the connector with the resolved source directly (the adapter's
      // create() does the same resolution; here we drive monitor end-to-end).
      const source = resolveDiscordEventSource()!;
      const port = createDiscordConnector({
        config: { token: 'discord-bot-token' },
        // getCurrentUser is the only network call monitor() makes before
        // subscribing; stub it via a fetch impl that returns a bot identity so
        // the REAL monitor() path runs without a live Discord token.
        fetchImpl: (async () =>
          new Response(JSON.stringify({ id: 'bot1', username: 'recoder-bot' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })) as unknown as typeof fetch,
        eventSource: source as unknown as Parameters<typeof createDiscordConnector>[0]['eventSource'],
      });

      const received: NormalizedInboundMessage[] = [];
      const handle = await port.monitor('default', async (m) => {
        received.push(m);
      });
      expect(pushed).toBeTypeOf('function');

      await pushed!({
        message: {
          id: 'm9',
          channelId: 'c9',
          content: 'ping',
          channelType: 1,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        author: { id: 'u9', username: 'bob', bot: false },
      });

      expect(received).toHaveLength(1);
      expect(received[0].text).toBe('ping');
      expect(received[0].channel).toBe('discord');
      await handle.stop();
    } finally {
      restore();
    }
  });
});
