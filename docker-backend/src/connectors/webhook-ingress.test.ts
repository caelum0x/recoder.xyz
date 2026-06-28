/**
 * Tests for the HTTP webhook ingress for push-only connector channels (LINE +
 * Slack HTTP Events).
 *
 * What is REAL here (not stubbed):
 *   - Signature verification is the REAL HMAC code under test: a validly-signed
 *     LINE delivery (real base64 HMAC-SHA256 over the raw body) and a real Slack
 *     `v0` signature both pass; a tampered signature is rejected 401.
 *   - The Express route runs end-to-end over a REAL http server with the REAL
 *     `express.raw()` body parser, so raw-body preservation is genuinely
 *     exercised (the bytes the signature was computed over reach the verifier).
 *   - Each verified event is normalized by the channel adapter's REAL
 *     `normalize()` (imported from the @recoder/connectors subpath) and pushed
 *     through the gateway's REAL gate -> dispatch path.
 *
 * The only test doubles: `createWorkspace`/`getWorkspace` are mocked so we can
 * ASSERT a dispatch fired exactly once without launching tmux/worktrees, and the
 * line/slack ConnectorPorts are built at the SDK seam by a SeamConnector whose
 * normalize() delegates to the real adapter (so no live SDK transport is needed).
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { type Server } from 'node:http';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import express from 'express';

// The shared test setup replaces global.fetch with a mock; capture the REAL
// fetch (at module load, before setup runs) so this suite can make genuine HTTP
// requests against its own server and read real Response bodies.
const _realFetch = globalThis.fetch;
import type {
  ConnectorKind,
  ConnectorMonitorHandle,
  ConnectorPort,
  ConnectorProbeResult,
  InboundHandler,
  NormalizedInboundMessage,
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from '@recoder/connectors';

// --- Mock the Conductor dispatch seam so we can assert without launching. ----
const createWorkspace = vi.fn();
const getWorkspace = vi.fn();
vi.mock('../conductor/workspace-service.js', () => ({
  createWorkspace: (...args: unknown[]) => createWorkspace(...args),
  getWorkspace: (...args: unknown[]) => getWorkspace(...args),
}));

// REAL adapters — used ONLY to drive each channel's REAL normalize().
import { SlackConnector } from '@recoder/connectors/slack';
import { LineConnector } from '@recoder/connectors/line';

import { overrideAdapterFactory } from './channel-adapters';
import { startConnectors, stopConnectors } from './index';
import { createConnectorsWebhookRouter } from './webhook-ingress';

/** In-memory ConnectorPort at the SDK seam; normalize() delegates to the real adapter. */
class SeamConnector implements ConnectorPort {
  readonly sent: OutboundMessage[] = [];
  constructor(
    readonly kind: ConnectorKind,
    private readonly realNormalize: (raw: unknown, accountId: string) => NormalizedInboundMessage | undefined,
  ) {}
  async monitor(_accountId: string, _onMessage: InboundHandler): Promise<ConnectorMonitorHandle> {
    return { stop: async () => {} };
  }
  async send(message: OutboundMessage): Promise<SendResult> {
    this.sent.push(message);
    return { delivered: true, messageIds: ['1'] };
  }
  async probe(accountId: string): Promise<ConnectorProbeResult> {
    return { channel: this.kind, accountId, ready: true, identity: `@${this.kind}-bot`, checkedAt: Date.now() };
  }
  normalize(raw: unknown, accountId: string): NormalizedInboundMessage | undefined {
    return this.realNormalize(raw, accountId);
  }
  async react(_request: ReactionRequest): Promise<boolean> {
    return true;
  }
}

const ln = new LineConnector({
  config: { channelAccessToken: 't', channelSecret: 's' },
  ingress: { register: () => ({ unregister: () => {} }) },
});
const sl = new SlackConnector();

const LINE_SECRET = 'line-webhook-secret';
const SLACK_SECRET = 'slack-signing-secret';

/** Env keys this suite manages so a developer's real env never leaks in. */
const ENV_KEYS = [
  'CONNECTORS_CHANNELS',
  'CONNECTORS_REPO_PATH',
  'CONNECTORS_ALLOWLIST',
  'CONNECTORS_REQUIRE_MENTION',
  'CONNECTORS_SPACE_ID',
  'CONNECTORS_PROJECT_ID',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'LINE_ACCOUNT_ID',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_ACCOUNT_ID',
];
let savedEnv: Record<string, string | undefined> = {};

/** Sign a LINE webhook body: base64(HMAC-SHA256(rawBody, channelSecret)). */
function signLine(rawBody: string): string {
  return createHmac('sha256', LINE_SECRET).update(rawBody).digest('base64');
}

/** Sign a Slack request with the v0 scheme over `v0:<ts>:<rawBody>`. */
function signSlack(rawBody: string, ts: string): string {
  return `v0=${createHmac('sha256', SLACK_SECRET).update(`v0:${ts}:${rawBody}`).digest('hex')}`;
}

let server: Server | null = null;
let baseUrl = '';
const restores: Array<() => void> = [];

async function listen(app: express.Express): Promise<void> {
  const instance = app.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  server = instance;
  const addr = instance.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

describe('connectors webhook ingress — push-only LINE + Slack', () => {
  beforeAll(() => {
    globalThis.fetch = _realFetch;
  });
  afterAll(() => {
    globalThis.fetch = _realFetch;
  });

  beforeEach(async () => {
    globalThis.fetch = _realFetch;
    createWorkspace.mockReset();
    getWorkspace.mockReset();
    getWorkspace.mockResolvedValue(null);
    createWorkspace.mockResolvedValue({
      workspaceId: 'ws_hook',
      state: 'running',
      runtimeId: 'claude_code',
      branch: 'recoder/ws_hook',
    });

    // Snapshot + set a deterministic env: only line + slack configured, dispatch
    // ready, allow-all so the gate passes (the gate itself is exercised, not faked).
    savedEnv = {};
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.CONNECTORS_CHANNELS = 'line,slack';
    process.env.CONNECTORS_REPO_PATH = '/repos/demo';
    process.env.CONNECTORS_ALLOWLIST = '*';
    process.env.CONNECTORS_REQUIRE_MENTION = 'false';
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'line-token';
    process.env.LINE_CHANNEL_SECRET = LINE_SECRET;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.SLACK_SIGNING_SECRET = SLACK_SECRET;

    // Inject SeamConnectors at the SDK seam so the gateway builds real ports
    // whose normalize() is the genuine adapter conversion.
    restores.push(overrideAdapterFactory('line', async () => new SeamConnector('line', (r, a) => ln.normalize(r, a))));
    restores.push(overrideAdapterFactory('slack', async () => new SeamConnector('slack', (r, a) => sl.normalize(r, a))));

    await startConnectors();

    const app = express();
    app.use('/api/connectors/webhook', createConnectorsWebhookRouter());
    await listen(app);
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    await stopConnectors();
    while (restores.length) restores.pop()!();
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.clearAllMocks();
  });

  it('a validly-signed LINE webhook dispatches once to createWorkspace', async () => {
    const body = JSON.stringify({
      destination: 'Uxxxx',
      events: [
        {
          type: 'message',
          replyToken: 'rt',
          source: { type: 'user', userId: 'U1' },
          message: { type: 'text', id: 'm1', text: '/run build the landing page' },
          timestamp: 1700000000000,
        },
      ],
    });
    const res = await fetch(`${baseUrl}/api/connectors/webhook/line`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-line-signature': signLine(body) },
      body,
    });
    expect(res.status).toBe(200);

    // The route ACKs then dispatches async; allow the microtask queue to flush.
    await vi.waitFor(() => expect(createWorkspace).toHaveBeenCalledTimes(1));
    const arg = createWorkspace.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.prompt).toBe('build the landing page');
    expect(arg.repoPath).toBe('/repos/demo');
    expect(String(arg.createdBy)).toContain('connector:line:');
  });

  it('a Slack url_verification challenge is answered (signed) and does NOT dispatch', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: 'url_verification', challenge: 'chal_abc123', token: 'x' });
    const res = await fetch(`${baseUrl}/api/connectors/webhook/slack`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-slack-signature': signSlack(body, ts),
        'x-slack-request-timestamp': ts,
      },
      body,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { challenge?: string };
    expect(json.challenge).toBe('chal_abc123');
    // A handshake is not a message — nothing dispatches.
    await new Promise((r) => setTimeout(r, 20));
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('a validly-signed Slack event dispatches once to createWorkspace', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      type: 'event_callback',
      event: {
        type: 'message',
        user: 'U123',
        channel: 'D999',
        text: '/run build the landing page',
        ts: '1700000000.0001',
        channel_type: 'im',
      },
    });
    const res = await fetch(`${baseUrl}/api/connectors/webhook/slack`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-slack-signature': signSlack(body, ts),
        'x-slack-request-timestamp': ts,
      },
      body,
    });
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(createWorkspace).toHaveBeenCalledTimes(1));
    const arg = createWorkspace.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.prompt).toBe('build the landing page');
    expect(String(arg.createdBy)).toContain('connector:slack:');
  });

  it('an INVALID LINE signature is rejected 401 and does NOT dispatch', async () => {
    const body = JSON.stringify({
      destination: 'Uxxxx',
      events: [
        {
          type: 'message',
          replyToken: 'rt',
          source: { type: 'user', userId: 'U1' },
          message: { type: 'text', id: 'm1', text: '/run build the landing page' },
          timestamp: 1700000000000,
        },
      ],
    });
    const res = await fetch(`${baseUrl}/api/connectors/webhook/line`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-line-signature': 'not-a-valid-signature' },
      body,
    });
    expect(res.status).toBe(401);
    await new Promise((r) => setTimeout(r, 20));
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('an INVALID Slack signature is rejected 401 and does NOT dispatch', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      type: 'event_callback',
      event: { type: 'message', user: 'U123', channel: 'D999', text: '/run x', ts: '1700000000.0001', channel_type: 'im' },
    });
    // Sign a DIFFERENT body so the v0 digest will not match the delivered bytes.
    const res = await fetch(`${baseUrl}/api/connectors/webhook/slack`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-slack-signature': signSlack('{}', ts),
        'x-slack-request-timestamp': ts,
      },
      body,
    });
    expect(res.status).toBe(401);
    await new Promise((r) => setTimeout(r, 20));
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('GET /api/connectors reports line/slack as live-inbound-capable (requiresExternal:false) once the ingress is mounted', async () => {
    // The webhook router was mounted in beforeEach -> the ingress flag is set.
    // Health must now report line/slack as no longer requiresExternal.
    const { connectorsHealth } = await import('./index');
    const health = await connectorsHealth();
    const line = health.channels.find((c) => c.channel === 'line');
    const slack = health.channels.find((c) => c.channel === 'slack');
    expect(line?.configured).toBe(true);
    expect(line?.requiresExternal).toBe(false);
    expect(slack?.configured).toBe(true);
    expect(slack?.requiresExternal).toBe(false);
  });
});
