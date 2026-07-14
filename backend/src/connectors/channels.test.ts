/**
 * Multi-channel connectors test — proves the gateway can take ANY of the seven
 * live @recoder/connectors adapters live from config, behind the optional-SDK
 * loader, and that a gated inbound message on each routes to createWorkspace (the
 * same Conductor dispatch path telegram uses today).
 *
 * What is REAL here (not stubbed):
 *   - Each channel's `normalize()` is the REAL adapter implementation imported
 *     from its @recoder/connectors subpath — we feed it an authentic raw event
 *     and assert it produces the NormalizedInboundMessage the gateway consumes.
 *   - The trust-boundary gate (`resolveGate`) and the gateway's command parsing,
 *     branch selection, and `dispatch()` are the REAL product code under test.
 *
 * The only test double is at the SDK SEAM: `overrideAdapterFactory` swaps each
 * channel's live transport (long-poll / Socket Mode / webhook / daemon) for an
 * in-memory `ConnectorPort` whose `monitor()` captures the inbound handler. The
 * Conductor `createWorkspace` is mocked so we can ASSERT a real dispatch without
 * launching tmux/worktrees — `dispatch` itself is never mocked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  ConnectorPort,
  ConnectorKind,
  ConnectorMonitorHandle,
  ConnectorProbeResult,
  InboundHandler,
  NormalizedInboundMessage,
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from '@recoder/connectors';

// --- Mock the Conductor dispatch seam so we can assert without launching ----
const createWorkspace = vi.fn();
const getWorkspace = vi.fn();
vi.mock('../conductor/workspace-service.js', () => ({
  createWorkspace: (...args: unknown[]) => createWorkspace(...args),
  getWorkspace: (...args: unknown[]) => getWorkspace(...args),
}));

import { ConnectorsGateway } from './gateway';
import type { ConnectorsConfig, ChannelConfig } from './config';
import { overrideAdapterFactory } from './channel-adapters';

// Real adapter subpaths — used ONLY to drive each channel's REAL normalize().
import { TelegramConnector } from '@recoder/connectors/telegram';
import { SlackConnector } from '@recoder/connectors/slack';
import { createSignalConnector } from '@recoder/connectors/signal';
import { createWhatsAppConnector } from '@recoder/connectors/whatsapp';
import { LineConnector } from '@recoder/connectors/line';
import { FeishuConnector } from '@recoder/connectors/feishu';
import { createIMessageConnector } from '@recoder/connectors/imessage';

/**
 * In-memory ConnectorPort double sitting at the SDK seam. `monitor()` captures
 * the gateway's inbound handler; `normalize()` delegates to the REAL adapter so
 * the gateway sees authentic NormalizedInboundMessages. send/react are recorded.
 */
class SeamConnector implements ConnectorPort {
  handler: InboundHandler | null = null;
  readonly sent: OutboundMessage[] = [];
  readonly reactions: ReactionRequest[] = [];

  constructor(
    readonly kind: ConnectorKind,
    private readonly realNormalize: (raw: unknown, accountId: string) => NormalizedInboundMessage | undefined,
  ) {}

  async monitor(_accountId: string, onMessage: InboundHandler): Promise<ConnectorMonitorHandle> {
    this.handler = onMessage;
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
  async react(request: ReactionRequest): Promise<boolean> {
    this.reactions.push(request);
    return true;
  }
}

const DISPATCH = {
  repoPath: '/repos/demo',
  runtimeId: 'claude_code' as const,
  spaceId: 'space_1',
  projectId: 'proj_1',
};

function channelConfig(channel: ConnectorKind, requiresExternal: boolean): ChannelConfig {
  return { channel, token: `tok_${channel}`, accountId: `acct_${channel}`, requiresExternal };
}

function configFor(channels: ChannelConfig[], allowlist: readonly string[]): ConnectorsConfig {
  return {
    channels,
    unconfigured: [],
    dispatch: DISPATCH,
    gating: { allowlist, requireMention: false },
  };
}

/**
 * One channel case: the REAL adapter to source normalize from, an authentic raw
 * event, the allowlist principal that authorizes it, the prompt the command must
 * resolve to, and whether the channel needs an external dependency for live inbound.
 */
interface ChannelCase {
  readonly channel: ConnectorKind;
  readonly normalize: (raw: unknown, accountId: string) => NormalizedInboundMessage | undefined;
  readonly raw: unknown;
  readonly allowPrincipal: string;
  readonly expectedPrompt: string;
  readonly requiresExternal: boolean;
}

const tg = new TelegramConnector();
const sl = new SlackConnector();
const sig = createSignalConnector();
const wa = createWhatsAppConnector();
const ln = new LineConnector({ config: { channelAccessToken: 't', channelSecret: 's' }, ingress: { register: () => ({ unregister: () => {} }) } });
const fs = new FeishuConnector();
const im = createIMessageConnector();

const CASES: readonly ChannelCase[] = [
  {
    channel: 'telegram',
    normalize: (r, a) => tg.normalize(r, a),
    raw: {
      update_id: 1,
      message: {
        message_id: 7,
        chat: { id: 555, type: 'private' },
        from: { id: 42, username: 'alice', first_name: 'Al' },
        text: '/run build the landing page',
        date: 1700000000,
      },
    },
    allowPrincipal: 'alice',
    expectedPrompt: 'build the landing page',
    requiresExternal: false,
  },
  {
    channel: 'slack',
    normalize: (r, a) => sl.normalize(r, a),
    raw: { type: 'message', user: 'U123', channel: 'D999', text: '/run build the landing page', ts: '1700000000.0001', channel_type: 'im' },
    allowPrincipal: 'U123',
    expectedPrompt: 'build the landing page',
    requiresExternal: false,
  },
  {
    channel: 'feishu',
    normalize: (r, a) => fs.normalize(r, a),
    raw: {
      schema: '2.0',
      header: { event_type: 'im.message.receive_v1' },
      event: {
        sender: { sender_id: { open_id: 'ou_1' }, sender_type: 'user' },
        message: { message_id: 'om1', chat_id: 'oc1', chat_type: 'p2p', message_type: 'text', content: '{"text":"/run build the landing page"}', create_time: '1700000000000' },
      },
    },
    allowPrincipal: 'ou_1',
    expectedPrompt: 'build the landing page',
    requiresExternal: false,
  },
  {
    channel: 'line',
    normalize: (r, a) => ln.normalize(r, a),
    raw: { type: 'message', replyToken: 'rt', source: { type: 'user', userId: 'U1' }, message: { type: 'text', id: 'm1', text: '/run build the landing page' }, timestamp: 1700000000000 },
    allowPrincipal: 'U1',
    expectedPrompt: 'build the landing page',
    requiresExternal: true,
  },
  {
    channel: 'signal',
    normalize: (r, a) => sig.normalize(r, a),
    raw: { envelope: { source: '+15551234567', sourceUuid: 'uuid-1', timestamp: 1700000000000, dataMessage: { message: '/run build the landing page', timestamp: 1700000000000 } }, account: '+15550000000' },
    allowPrincipal: 'uuid:uuid-1',
    expectedPrompt: 'build the landing page',
    requiresExternal: true,
  },
  {
    channel: 'whatsapp',
    normalize: (r, a) => wa.normalize(r, a),
    raw: { key: { remoteJid: '15551234567@s.whatsapp.net', id: 'M1', fromMe: false }, message: { conversation: '/run build the landing page' }, messageTimestamp: 1700000000, pushName: 'Al' },
    allowPrincipal: '+15551234567',
    expectedPrompt: 'build the landing page',
    requiresExternal: true,
  },
  {
    channel: 'imessage',
    normalize: (r, a) => im.normalize(r, a),
    raw: { id: 'g1', text: '/run build the landing page', sender: '+15551234567', chat_id: 'chat1', chat_guid: 'chatg1', chat_identifier: '+15551234567', is_from_me: false, is_group: false, created_at: '2023-11-14T00:00:00Z', attachments: [] },
    allowPrincipal: '+15551234567',
    expectedPrompt: 'build the landing page',
    requiresExternal: true,
  },
];

describe('connectors — all seven channels register + dispatch from config', () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    createWorkspace.mockReset();
    getWorkspace.mockReset();
  });
  afterEach(() => {
    restore?.();
    restore = null;
    vi.clearAllMocks();
  });

  for (const c of CASES) {
    it(`${c.channel}: a configured channel registers and a gated inbound dispatches to createWorkspace`, async () => {
      vi.useFakeTimers();
      try {
        createWorkspace.mockResolvedValue({
          workspaceId: `ws_${c.channel}`,
          state: 'running',
          runtimeId: 'claude_code',
          branch: `recoder/ws_${c.channel}`,
        });
        getWorkspace.mockResolvedValue(null);

        // First assert the REAL adapter normalize produces the message the gateway
        // will route — this is the adapter's genuine event -> domain conversion.
        const normalized = c.normalize(c.raw, `acct_${c.channel}`);
        expect(normalized, `${c.channel} normalize must yield a message`).toBeTruthy();
        expect(normalized!.text).toContain('build the landing page');

        // Inject the in-memory port at the SDK seam; its normalize delegates to the
        // REAL adapter so the gateway path is exercised end to end.
        let seam: SeamConnector | null = null;
        restore = overrideAdapterFactory(c.channel, async () => {
          seam = new SeamConnector(c.channel, c.normalize);
          return seam;
        });

        const gateway = new ConnectorsGateway(
          configFor([channelConfig(c.channel, c.requiresExternal)], [c.allowPrincipal]),
        );
        await gateway.start();

        expect(seam, 'adapter factory must have built the seam port').not.toBeNull();
        expect(seam!.handler, 'gateway must register a monitor handler').toBeTypeOf('function');

        // Push the REAL normalized message through the gateway's monitor handler:
        // real gate -> real command parse -> real dispatch -> createWorkspace.
        await seam!.handler!(normalized!);

        expect(createWorkspace, `${c.channel} gated inbound must dispatch`).toHaveBeenCalledTimes(1);
        const arg = createWorkspace.mock.calls[0][0] as Record<string, unknown>;
        expect(arg.prompt).toBe(c.expectedPrompt);
        expect(arg.repoPath).toBe('/repos/demo');
        expect(arg.runtimeId).toBe('claude_code');
        expect(String(arg.createdBy)).toContain(`connector:${c.channel}:`);

        await gateway.stop();
        vi.clearAllTimers();
      } finally {
        vi.useRealTimers();
      }
    });

    it(`${c.channel}: a NON-gated sender (not on allowlist) takes NO action`, async () => {
      restore = overrideAdapterFactory(c.channel, async () => new SeamConnector(c.channel, c.normalize));
      const gateway = new ConnectorsGateway(
        configFor([channelConfig(c.channel, c.requiresExternal)], ['somebody-else']),
      );
      await gateway.start();
      const normalized = c.normalize(c.raw, `acct_${c.channel}`)!;
      // Reach the seam to push the message.
      // (handler captured during start via the injected factory)
      const seamPort = (gateway as unknown as { runtimes: { port?: SeamConnector }[] }).runtimes[0]?.port;
      await seamPort!.handler!(normalized);
      expect(createWorkspace).not.toHaveBeenCalled();
      await gateway.stop();
    });
  }
});

describe('connectors — unconfigured channels report configured:false and do NOT register', () => {
  it('reports every unconfigured channel truthfully (configured:false + reason) without registering a port', async () => {
    // No channels configured; signal + line are reported as configured:false.
    const gateway = new ConnectorsGateway({
      channels: [],
      unconfigured: [
        { channel: 'signal', reason: 'SIGNAL_ACCOUNT not set' },
        { channel: 'line', reason: 'LINE_CHANNEL_ACCESS_TOKEN not set' },
      ],
      dispatch: undefined,
      gating: { allowlist: [], requireMention: true },
    });

    // Inert: nothing configured -> not active, start is a safe no-op.
    expect(gateway.active).toBe(false);
    await expect(gateway.start()).resolves.toBeUndefined();

    const health = await gateway.health();
    expect(health.active).toBe(false);

    const signal = health.channels.find((ch) => ch.channel === 'signal');
    const line = health.channels.find((ch) => ch.channel === 'line');
    expect(signal).toBeTruthy();
    expect(signal!.configured).toBe(false);
    expect(signal!.available).toBe(false);
    expect(signal!.connected).toBe(false);
    expect(signal!.reason).toContain('SIGNAL_ACCOUNT');
    expect(line!.configured).toBe(false);
    expect(line!.reason).toContain('LINE_CHANNEL_ACCESS_TOKEN');

    // A truly unconfigured channel never dispatched anything.
    expect(createWorkspace).not.toHaveBeenCalled();
    await gateway.stop();
  });

  it('a configured channel that requires an external dependency reports requiresExternal truthfully', async () => {
    const restore = overrideAdapterFactory('line', async () => new SeamConnector('line', (r, a) => ln.normalize(r, a)));
    try {
      const gateway = new ConnectorsGateway(
        configFor([channelConfig('line', true)], ['U1']),
      );
      await gateway.start();
      const health = await gateway.health();
      const line = health.channels.find((ch) => ch.channel === 'line');
      expect(line!.configured).toBe(true);
      expect(line!.available).toBe(true); // port built behind the SDK seam
      expect(line!.requiresExternal).toBe(true);
      await gateway.stop();
    } finally {
      restore();
    }
  });
});
