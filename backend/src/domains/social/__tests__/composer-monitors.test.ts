/**
 * SocialComposer channel monitors — `start()` opens the long-poll ingress
 * monitor for every ENABLED channel through the gateway-resolved ConnectorPort,
 * feeds each normalized inbound message into the inbound pipeline, and `stop()`
 * releases every live handle. Truthful degrade: an unresolvable channel (dep
 * absent) is skipped + logged — never a faked "monitoring" state.
 */
import { describe, it, expect, vi } from 'vitest';
import { createSocialComposer } from '../social-module.js';
import type { OpenclawGateway } from '../adapters/openclaw-gateway.adapter.js';
import type { ConnectorPort } from '../ports/connector-port.js';
import type { ChannelId } from '../types.js';
import { loadConfig } from '../../../bootstrap/config.js';
import { childLogger } from '../../../shared/logger.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';

type InboundHandler = (message: unknown) => void | Promise<void>;

/** A fake ConnectorPort whose monitor records the handler + supports stop(). */
function fakePort(): {
  port: ConnectorPort;
  monitor: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  emit: (message: unknown) => Promise<void>;
} {
  let handler: InboundHandler | null = null;
  const stop = vi.fn(async () => undefined);
  const monitor = vi.fn(async (_account: string, onMessage: InboundHandler) => {
    handler = onMessage;
    return { stop };
  });
  const port = {
    kind: 'telegram',
    send: vi.fn(async () => ({ delivered: false, messageIds: [] })),
    probe: vi.fn(async () => ({ ready: false })),
    monitor,
    normalize: (raw: unknown) => raw,
  } as unknown as ConnectorPort;
  return {
    port,
    monitor,
    stop,
    emit: async (message) => {
      if (!handler) throw new Error('monitor handler not registered');
      await handler(message);
    },
  };
}

function fakeGateway(ports: Partial<Record<ChannelId, ConnectorPort | null>>): OpenclawGateway {
  return {
    supported: () => Object.keys(ports) as ChannelId[],
    resolve: async (channel: ChannelId) => ports[channel] ?? null,
  };
}

function buildComposer(gateway: OpenclawGateway, enabled: readonly ChannelId[]) {
  const channels = {} as Record<ChannelId, { enabled: boolean; secretRef: string | null }>;
  for (const id of enabled) channels[id] = { enabled: true, secretRef: null };
  return createSocialComposer({
    config: loadConfig({}),
    logger: childLogger('social-test'),
    overrides: { channels },
    middleware: {} as AuthMiddleware,
    gateway,
  });
}

describe('SocialComposer — channel monitors', () => {
  it('start() opens a monitor per enabled channel and stop() releases it', async () => {
    const telegram = fakePort();
    const composer = buildComposer(fakeGateway({ telegram: telegram.port }), ['telegram']);

    await composer.start();
    expect(telegram.monitor).toHaveBeenCalledTimes(1);
    expect(telegram.monitor).toHaveBeenCalledWith('default', expect.any(Function));

    await composer.stop();
    expect(telegram.stop).toHaveBeenCalledTimes(1);
  });

  it('a monitored inbound message flows into the inbound pipeline', async () => {
    const telegram = fakePort();
    const composer = buildComposer(fakeGateway({ telegram: telegram.port }), ['telegram']);
    const ingest = vi.spyOn(composer.pipeline(), 'ingest');

    await composer.start();
    await telegram.emit({
      channel: 'telegram',
      conversationId: 'chat-1',
      messageId: 'm-1',
      text: 'hello',
      sender: { SenderId: 'u-1' },
      mentioned: false,
    });
    // The handler ingests asynchronously (fire-and-forget) — flush microtasks.
    await new Promise((r) => setTimeout(r, 0));

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'telegram', chatRef: 'chat-1', providerMsgId: 'm-1' }),
    );
    await composer.stop();
  });

  it('an unresolvable channel is skipped truthfully (no monitor, no throw)', async () => {
    const composer = buildComposer(fakeGateway({ telegram: null }), ['telegram']);
    await expect(composer.start()).resolves.toBeUndefined();
    await expect(composer.stop()).resolves.toBeUndefined();
  });

  it('a monitor fault degrades that channel without failing start()', async () => {
    const broken = fakePort();
    broken.monitor.mockRejectedValueOnce(new Error('poller refused'));
    const composer = buildComposer(fakeGateway({ telegram: broken.port }), ['telegram']);
    await expect(composer.start()).resolves.toBeUndefined();
    // The failed channel holds no handle, so stop() has nothing to release.
    await composer.stop();
    expect(broken.stop).not.toHaveBeenCalled();
  });

  it('disabled channels never open monitors', async () => {
    const telegram = fakePort();
    const composer = buildComposer(fakeGateway({ telegram: telegram.port }), []);
    await composer.start();
    expect(telegram.monitor).not.toHaveBeenCalled();
    await composer.stop();
  });
});
