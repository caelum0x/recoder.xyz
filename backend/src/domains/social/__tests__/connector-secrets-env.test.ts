/**
 * connector-secrets env-convention resolution — proves the domain gate can see
 * the ENGINE's own env secrets (the same vars the openclaw connectors read), so
 * `send` and webhook verification genuinely work when only the documented engine
 * env token is set — and stay truthfully unavailable when nothing is set.
 *
 * Precedence contract: directResolver > vault > engine env; null-degrade intact.
 */
import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createConnectorSecretsAdapter,
  resolveEngineEnvSecret,
  type EnvSource,
} from '../adapters/connector-secrets.adapter.js';
import { createChannelAdapterRegistry } from '../adapters/channel-adapter-registry.js';
import type { OpenclawGateway } from '../adapters/openclaw-gateway.adapter.js';
import type { ConnectorPort, OutboundMessage, SendResult } from '../ports/connector-port.js';
import { processWebhookDelivery } from '../adapters/webhook-ingress.adapter.js';

const NO_REFS = { tokenRefs: {} } as const;

function envOf(vars: Record<string, string | undefined>): EnvSource {
  return vars;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('connector-secrets — engine env convention (last precedence)', () => {
  it('resolves the telegram token from RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN', async () => {
    const secrets = createConnectorSecretsAdapter({
      ...NO_REFS,
      env: envOf({ RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN: 'tg-recoder' }),
    });
    await expect(secrets.resolve('telegram', 'token')).resolves.toBe('tg-recoder');
  });

  it('falls back to the channel-native bare name (TELEGRAM_BOT_TOKEN)', async () => {
    const secrets = createConnectorSecretsAdapter({
      ...NO_REFS,
      env: envOf({ TELEGRAM_BOT_TOKEN: 'tg-bare' }),
    });
    await expect(secrets.resolve('telegram', 'token')).resolves.toBe('tg-bare');
  });

  it('prefers the RECODER_CONNECTORS_* name over the legacy and bare names', async () => {
    const secrets = createConnectorSecretsAdapter({
      ...NO_REFS,
      env: envOf({
        RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN: 'primary',
        OPENCLAW_TELEGRAM_BOT_TOKEN: 'legacy',
        TELEGRAM_BOT_TOKEN: 'bare',
      }),
    });
    await expect(secrets.resolve('telegram', 'token')).resolves.toBe('primary');
  });

  it('nothing set ⇒ truthfully null (degrade unchanged)', async () => {
    const secrets = createConnectorSecretsAdapter({ ...NO_REFS, env: envOf({}) });
    await expect(secrets.resolve('telegram', 'token')).resolves.toBeNull();
    await expect(secrets.resolve('slack', 'signing')).resolves.toBeNull();
  });

  it('whitespace-only env values resolve to null, never an empty secret', async () => {
    const secrets = createConnectorSecretsAdapter({
      ...NO_REFS,
      env: envOf({ TELEGRAM_BOT_TOKEN: '   ' }),
    });
    await expect(secrets.resolve('telegram', 'token')).resolves.toBeNull();
  });

  it('channels without a verified single-env convention never resolve from env', () => {
    const env = envOf({ FEISHU_BOT_TOKEN: 'guessed', SIGNAL_BOT_TOKEN: 'guessed' });
    expect(resolveEngineEnvSecret(env, 'feishu', 'token')).toBeNull();
    expect(resolveEngineEnvSecret(env, 'signal', 'token')).toBeNull();
  });

  it('directResolver still wins over the env convention', async () => {
    const secrets = createConnectorSecretsAdapter({
      ...NO_REFS,
      directResolver: () => 'from-direct',
      env: envOf({ TELEGRAM_BOT_TOKEN: 'from-env' }),
    });
    await expect(secrets.resolve('telegram', 'token')).resolves.toBe('from-direct');
  });

  it('vault still wins over the env convention; env fills in when the vault misses', async () => {
    const vault = { resolve: vi.fn(async (ref: string) => (ref === 'vault:tg' ? 'from-vault' : null)) };
    const secrets = createConnectorSecretsAdapter({
      tokenRefs: { telegram: 'vault:tg', slack: 'vault:slack' },
      vault,
      env: envOf({ TELEGRAM_BOT_TOKEN: 'from-env', SLACK_BOT_TOKEN: 'slack-env' }),
    });
    await expect(secrets.resolve('telegram', 'token')).resolves.toBe('from-vault');
    // Vault cannot resolve slack's ref ⇒ the engine env convention fills in.
    await expect(secrets.resolve('slack', 'token')).resolves.toBe('slack-env');
  });

  it('defaults to process.env (zero-bootstrap wiring)', async () => {
    vi.stubEnv('RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN', 'tg-process-env');
    const secrets = createConnectorSecretsAdapter(NO_REFS);
    await expect(secrets.resolve('telegram', 'token')).resolves.toBe('tg-process-env');
  });
});

describe('channel-adapter registry — send reaches the connector on engine env token', () => {
  function fakePort(sendResult: SendResult): { port: ConnectorPort; sendSpy: ReturnType<typeof vi.fn> } {
    const sendSpy = vi.fn(async (_msg: OutboundMessage) => sendResult);
    const port = {
      kind: 'telegram',
      monitor: vi.fn(),
      send: sendSpy,
      probe: vi.fn(async () => ({ ready: true })),
    } as unknown as ConnectorPort;
    return { port, sendSpy };
  }

  function fakeGateway(port: ConnectorPort | null): OpenclawGateway {
    return {
      resolve: vi.fn(async () => port),
      supported: () => ['telegram'],
    } as unknown as OpenclawGateway;
  }

  const message: OutboundMessage = {
    target: { channel: 'telegram' as never, accountId: 'default', conversationId: 'chat-1' },
    text: 'hello',
  } as OutboundMessage;

  it('env token set ⇒ send is handed to port.send and its result returned', async () => {
    const { port, sendSpy } = fakePort({ delivered: true, messageIds: ['m1'] });
    const secrets = createConnectorSecretsAdapter({
      ...NO_REFS,
      env: envOf({ RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN: 'tg-token' }),
    });
    const registry = createChannelAdapterRegistry({ gateway: fakeGateway(port), secrets });

    const result = await registry.send('telegram', message);
    expect(result).toEqual({ delivered: true, messageIds: ['m1'] });
    expect(sendSpy).toHaveBeenCalledWith(message);
  });

  it('env token set ⇒ statuses reports the channel configured', async () => {
    const { port } = fakePort({ delivered: true, messageIds: [] });
    const secrets = createConnectorSecretsAdapter({
      ...NO_REFS,
      env: envOf({ TELEGRAM_BOT_TOKEN: 'tg-token' }),
    });
    const registry = createChannelAdapterRegistry({ gateway: fakeGateway(port), secrets });

    const [status] = await registry.statuses(['telegram']);
    expect(status).toMatchObject({ channel: 'telegram', bound: true, configured: true, ready: true });
  });

  it('env unset ⇒ NOT_DELIVERED and the connector is never invoked (unchanged degrade)', async () => {
    const { port, sendSpy } = fakePort({ delivered: true, messageIds: ['m1'] });
    const secrets = createConnectorSecretsAdapter({ ...NO_REFS, env: envOf({}) });
    const registry = createChannelAdapterRegistry({ gateway: fakeGateway(port), secrets });

    const result = await registry.send('telegram', message);
    expect(result).toEqual({ delivered: false, messageIds: [] });
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe('webhook signing — engine env signing secret verifies real HMACs', () => {
  it('SLACK_SIGNING_SECRET set ⇒ a genuinely signed slack delivery verifies', async () => {
    const signingSecret = 'slack-signing-secret';
    const secrets = createConnectorSecretsAdapter({
      ...NO_REFS,
      env: envOf({ SLACK_SIGNING_SECRET: signingSecret }),
    });
    const secret = await secrets.resolve('slack', 'signing');
    expect(secret).toBe(signingSecret);

    const rawBody = Buffer.from(JSON.stringify({ type: 'event_callback', event: {} }), 'utf8');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac('sha256', signingSecret)
      .update(`v0:${timestamp}:${rawBody.toString('utf8')}`)
      .digest('hex')}`;

    const outcome = processWebhookDelivery({
      channel: 'slack',
      rawBody,
      secret,
      headers: { slackSignature: signature, slackTimestamp: timestamp },
    });
    expect(outcome.verified).toBe(true);
    expect(outcome.status).toBe(200);
  });

  it('RECODER_LINE_CHANNEL_SECRET set ⇒ a genuinely signed line delivery verifies', async () => {
    const channelSecret = 'line-channel-secret';
    const secrets = createConnectorSecretsAdapter({
      ...NO_REFS,
      env: envOf({ RECODER_LINE_CHANNEL_SECRET: channelSecret }),
    });
    const secret = await secrets.resolve('line', 'signing');
    expect(secret).toBe(channelSecret);

    const rawBody = Buffer.from(JSON.stringify({ events: [] }), 'utf8');
    const signature = createHmac('sha256', channelSecret).update(rawBody).digest('base64');

    const outcome = processWebhookDelivery({
      channel: 'line',
      rawBody,
      secret,
      headers: { lineSignature: signature },
    });
    expect(outcome.verified).toBe(true);
    expect(outcome.status).toBe(200);
  });

  it('signing secret unset ⇒ 401 refuse (unchanged hostile default)', async () => {
    const secrets = createConnectorSecretsAdapter({ ...NO_REFS, env: envOf({}) });
    const secret = await secrets.resolve('slack', 'signing');
    expect(secret).toBeNull();

    const outcome = processWebhookDelivery({
      channel: 'slack',
      rawBody: Buffer.from('{}', 'utf8'),
      secret,
      headers: {},
    });
    expect(outcome.status).toBe(401);
    expect(outcome.verified).toBe(false);
  });
});
