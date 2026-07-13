/**
 * Composition tests for the recoder-social runtime. No network, no channel
 * SDKs: drivers and ports are in-memory doubles injected at the same seams the
 * real boot uses (ChannelDriver.create -> ConnectorPort, EmbeddedRunner). The
 * gate, registry, and dispatch pipeline are the REAL @recoder/connectors code.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ConnectorKind,
  ConnectorPort,
  EmbeddedRunEvent,
  EmbeddedRunner,
  InboundHandler,
  NormalizedInboundMessage,
  OutboundMessage,
} from '@recoder/connectors';

import type { ChannelDriver } from './channels.js';
import { loadSocialConfig, type SocialConfig } from './config.js';
import { startStatusServer } from './health.js';
import { SocialRuntime } from './runtime.js';

function testConfig(overrides: Partial<SocialConfig> = {}): SocialConfig {
  return {
    http: { host: '127.0.0.1', port: 0 },
    gating: { allowlist: [], requireMention: true },
    agent: { enabled: false, agentId: 'connector-reply' },
    channelFilter: [],
    ...overrides,
  };
}

interface FakePort extends ConnectorPort {
  readonly sent: OutboundMessage[];
  emit(message: NormalizedInboundMessage): Promise<void>;
  readonly stopped: () => boolean;
}

function fakePort(kind: ConnectorKind): FakePort {
  const sent: OutboundMessage[] = [];
  let handler: InboundHandler | null = null;
  let stopped = false;
  return {
    kind,
    sent,
    stopped: () => stopped,
    async emit(message) {
      if (!handler) throw new Error('monitor not started');
      await handler(message);
    },
    async monitor(_accountId, onMessage) {
      handler = onMessage;
      return {
        stop: async () => {
          stopped = true;
          handler = null;
        },
      };
    },
    async send(message) {
      sent.push(message);
      return { delivered: true, messageIds: [`${kind}-out-${sent.length}`] };
    },
    async probe(accountId) {
      return { channel: kind, accountId, ready: true, checkedAt: Date.now() };
    },
    normalize: () => undefined,
    react: async () => false,
  };
}

function fakeDriver(
  kind: ConnectorKind,
  options: {
    configured?: boolean;
    reason?: string;
    requiresExternal?: boolean;
    create?: () => Promise<ConnectorPort>;
  } = {},
): ChannelDriver {
  const configured = options.configured ?? true;
  return {
    channel: kind,
    requiresExternal: options.requiresExternal ?? false,
    detect: () =>
      configured
        ? { configured: true, token: 'test-token', accountId: kind }
        : { configured: false, reason: options.reason ?? `${kind} not configured` },
    create: options.create ?? (async () => fakePort(kind)),
  };
}

function inbound(overrides: Partial<NormalizedInboundMessage> = {}): NormalizedInboundMessage {
  return {
    channel: 'telegram',
    accountId: 'telegram',
    messageId: 'm1',
    conversationId: 'c1',
    chatType: 'direct',
    sender: { SenderId: '42', SenderUsername: 'alice' },
    text: 'hello there',
    wasMentioned: false,
    attachments: [],
    timestamp: Date.now(),
    raw: {},
    ...overrides,
  };
}

function scriptedRunner(reply: string): EmbeddedRunner {
  return {
    async *run(): AsyncIterable<EmbeddedRunEvent> {
      yield { type: 'text', text: reply };
      yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SocialRuntime composition', () => {
  it('starts with no channels configured and reports it truthfully', async () => {
    const logs: string[] = [];
    const runtime = new SocialRuntime(testConfig(), {
      drivers: [fakeDriver('telegram', { configured: false, reason: 'TELEGRAM_BOT_TOKEN not set' })],
      runner: null,
      env: { log: (m) => logs.push(m), error: (m) => logs.push(m) },
    });
    await runtime.start();

    const status = runtime.status();
    expect(status.active).toBe(false);
    expect(status.channels).toHaveLength(1);
    expect(status.channels[0]).toMatchObject({
      channel: 'telegram',
      configured: false,
      available: false,
      connected: false,
      reason: 'TELEGRAM_BOT_TOKEN not set',
    });
    expect(logs.some((l) => l.includes('no channels configured'))).toBe(true);
    await runtime.stop();
  });

  it('connects a configured channel and blocks non-allowlisted inbound (hostile-by-default)', async () => {
    const port = fakePort('telegram');
    const runtime = new SocialRuntime(testConfig(), {
      drivers: [fakeDriver('telegram', { create: async () => port })],
      runner: scriptedRunner('should never be sent'),
    });
    await runtime.start();

    expect(runtime.status().active).toBe(true);
    expect(runtime.status().channels[0]).toMatchObject({ configured: true, available: true, connected: true });

    // Empty allowlist => the trust boundary drops everything, no send happens.
    await port.emit(inbound());
    const record = runtime.status().recentInbound.at(-1);
    expect(record).toMatchObject({ kind: 'blocked', outcomeStatus: 'blocked' });
    expect(record?.reason).toContain('allowlist');
    expect(port.sent).toHaveLength(0);
    await runtime.stop();
  });

  it('dispatches an allowlisted DM through the real pipeline and delivers the reply', async () => {
    const port = fakePort('telegram');
    const runtime = new SocialRuntime(
      testConfig({ gating: { allowlist: ['alice'], requireMention: true } }),
      {
        drivers: [fakeDriver('telegram', { create: async () => port })],
        runner: scriptedRunner('hi alice'),
      },
    );
    await runtime.start();

    await port.emit(inbound());
    expect(runtime.status().recentInbound.at(-1)).toMatchObject({
      kind: 'dispatched',
      outcomeStatus: 'delivered',
    });
    expect(port.sent).toHaveLength(1);
    expect(port.sent[0].text).toBe('hi alice');
    expect(port.sent[0].target).toMatchObject({ channel: 'telegram', conversationId: 'c1', replyTo: 'm1' });
    await runtime.stop();
  });

  it('reports a truthful no-runner outcome for authorized inbound when no agent is enabled', async () => {
    const port = fakePort('telegram');
    const runtime = new SocialRuntime(
      testConfig({ gating: { allowlist: ['alice'], requireMention: true } }),
      { drivers: [fakeDriver('telegram', { create: async () => port })], runner: null },
    );
    await runtime.start();

    expect(runtime.status().agentEnabled).toBe(false);
    await port.emit(inbound());
    const record = runtime.status().recentInbound.at(-1);
    expect(record?.kind).toBe('no-runner');
    expect(record?.reason).toContain('no embedded runner');
    expect(port.sent).toHaveLength(0); // never a fake reply
    await runtime.stop();
  });

  it('degrades a channel whose adapter fails to build without crashing start()', async () => {
    const runtime = new SocialRuntime(testConfig(), {
      drivers: [
        fakeDriver('slack', {
          create: async () => {
            throw new Error('@slack/bolt is not installed');
          },
        }),
        fakeDriver('telegram'),
      ],
      runner: null,
    });
    await runtime.start();

    const byChannel = new Map(runtime.status().channels.map((c) => [c.channel, c]));
    expect(byChannel.get('slack')).toMatchObject({ configured: true, available: false, connected: false });
    expect(byChannel.get('slack')?.reason).toContain('@slack/bolt is not installed');
    expect(byChannel.get('telegram')).toMatchObject({ connected: true });
    await runtime.stop();
  });

  it('keeps external-dependency channels send-capable but truthfully not live inbound', async () => {
    const port = fakePort('line');
    const runtime = new SocialRuntime(testConfig(), {
      drivers: [fakeDriver('line', { requiresExternal: true, create: async () => port })],
      runner: null,
    });
    await runtime.start();

    expect(runtime.status().channels[0]).toMatchObject({
      channel: 'line',
      configured: true,
      available: true,
      connected: false,
      requiresExternal: true,
    });
    expect(runtime.status().active).toBe(false);
    await runtime.stop();
  });

  it('stop() halts monitors and downgrades connected flags truthfully', async () => {
    const port = fakePort('telegram');
    const runtime = new SocialRuntime(testConfig(), {
      drivers: [fakeDriver('telegram', { create: async () => port })],
      runner: null,
    });
    await runtime.start();
    expect(runtime.status().channels[0].connected).toBe(true);

    await runtime.stop();
    expect(port.stopped()).toBe(true);
    expect(runtime.status().channels[0].connected).toBe(false);
    expect(runtime.status().active).toBe(false);
  });
});

async function getJson(url: string): Promise<{ success: boolean; data?: any; error?: string }> {
  const response = await fetch(url);
  return (await response.json()) as { success: boolean; data?: any; error?: string };
}

describe('status HTTP listener', () => {
  it('serves /health and truthful /status over loopback', async () => {
    const runtime = new SocialRuntime(testConfig(), {
      drivers: [fakeDriver('telegram', { configured: false, reason: 'TELEGRAM_BOT_TOKEN not set' })],
      runner: null,
    });
    await runtime.start();
    const status = await startStatusServer({
      host: '127.0.0.1',
      port: 0,
      getStatus: () => runtime.status(),
    });

    try {
      const health = await getJson(`http://127.0.0.1:${status.port}/health`);
      expect(health).toMatchObject({ success: true, data: { service: 'recoder-social', status: 'ok' } });

      const body = await getJson(`http://127.0.0.1:${status.port}/api/social/status`);
      expect(body.success).toBe(true);
      expect(body.data.active).toBe(false);
      expect(body.data.channels[0]).toMatchObject({ channel: 'telegram', configured: false });

      const missing = await fetch(`http://127.0.0.1:${status.port}/nope`);
      expect(missing.status).toBe(404);
    } finally {
      await status.close();
      await runtime.stop();
    }
  });
});

describe('config', () => {
  it('applies safe defaults and parses the env surface', () => {
    vi.stubEnv('SOCIAL_PORT', '');
    vi.stubEnv('CONNECTORS_ALLOWLIST', ' alice , bob ');
    vi.stubEnv('CONNECTORS_REQUIRE_MENTION', 'false');
    vi.stubEnv('CONNECTORS_CHANNELS', 'telegram,not-a-channel,slack');
    vi.stubEnv('CONNECTORS_AGENT_ENABLED', '');

    const config = loadSocialConfig();
    expect(config.http).toEqual({ host: '127.0.0.1', port: 7391 });
    expect(config.gating).toEqual({ allowlist: ['alice', 'bob'], requireMention: false });
    expect(config.agent.enabled).toBe(false);
    expect(config.channelFilter).toEqual(['telegram', 'slack']);
  });

  it('fails fast on an invalid SOCIAL_PORT', () => {
    vi.stubEnv('SOCIAL_PORT', 'not-a-port');
    expect(() => loadSocialConfig()).toThrow(/SOCIAL_PORT/);
  });
});
