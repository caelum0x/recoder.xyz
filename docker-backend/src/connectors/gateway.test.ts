/**
 * Tests for the connectors gateway — the inbound bridge from a chat channel to
 * the Conductor.
 *
 * These exercise the REAL trust-boundary gating (`resolveGate` from
 * `@recoder/connectors`, unstubbed) and the REAL `ConnectorsGateway` dispatch
 * wiring. The only test doubles are at the seams the gateway depends on:
 *   - `workspace-service.js` is mocked so we can ASSERT that a gated inbound
 *     message dispatches to `createWorkspace` (and that a blocked message does
 *     NOT), without launching a real tmux/worktree session.
 *   - the Telegram `ConnectorPort` is replaced by an in-memory fake connector so
 *     we can feed `monitor()` a normalized message and capture replies.
 *
 * The product code (gating, command parsing, dispatch branch selection) is the
 * real implementation under test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  ConnectorPort,
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

/**
 * An in-memory ConnectorPort. `monitor()` captures the inbound handler so the
 * test can push a normalized message through the real gateway path; send/react
 * are recorded for assertions.
 */
class FakeConnector implements ConnectorPort {
  readonly kind = 'telegram' as const;
  handler: InboundHandler | null = null;
  readonly sent: OutboundMessage[] = [];
  readonly reactions: ReactionRequest[] = [];

  async monitor(_accountId: string, onMessage: InboundHandler): Promise<ConnectorMonitorHandle> {
    this.handler = onMessage;
    return { stop: async () => {} };
  }
  async send(message: OutboundMessage): Promise<SendResult> {
    this.sent.push(message);
    return { delivered: true, messageIds: ['1'] };
  }
  async probe(accountId: string): Promise<ConnectorProbeResult> {
    return { channel: this.kind, accountId, ready: true, identity: '@fakebot', checkedAt: Date.now() };
  }
  normalize(): NormalizedInboundMessage | undefined {
    return undefined;
  }
  async react(request: ReactionRequest): Promise<boolean> {
    this.reactions.push(request);
    return true;
  }
}

// Replace the Telegram adapter so the gateway's buildPort() yields our fake.
let lastFakeConnector: FakeConnector | null = null;
vi.mock('./telegram-connector.js', () => ({
  TelegramConnector: class {
    constructor() {
      lastFakeConnector = new FakeConnector();
      return lastFakeConnector as unknown as object;
    }
  },
}));

import { ConnectorsGateway } from './gateway';
import type { ConnectorsConfig } from './config';

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
    timestamp: Date.now(),
    raw: {},
    ...overrides,
  };
}

const TELEGRAM_CHANNEL = { channel: 'telegram' as const, token: 'tok', accountId: 'acct_1' };
const DISPATCH = {
  repoPath: '/repos/demo',
  runtimeId: 'claude_code' as const,
  spaceId: 'space_1',
  projectId: 'proj_1',
};

function configWith(over: Partial<ConnectorsConfig> = {}): ConnectorsConfig {
  return {
    channels: [TELEGRAM_CHANNEL],
    dispatch: DISPATCH,
    gating: { allowlist: ['alice'], requireMention: false },
    ...over,
  };
}

describe('ConnectorsGateway — inbound dispatch wiring', () => {
  beforeEach(() => {
    createWorkspace.mockReset();
    getWorkspace.mockReset();
    lastFakeConnector = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches a gated inbound command to createWorkspace', async () => {
    // Fake timers so the post-dispatch status poll (a setTimeout in
    // followStatus) never leaks a pending real timer past the test.
    vi.useFakeTimers();
    try {
      createWorkspace.mockResolvedValue({
        workspaceId: 'ws_xyz',
        state: 'running',
        runtimeId: 'claude_code',
        branch: 'recoder/ws_xyz',
      });
      getWorkspace.mockResolvedValue(null); // poll sees it gone -> stops cleanly

      const gateway = new ConnectorsGateway(configWith());
      await gateway.start();

      expect(lastFakeConnector).not.toBeNull();
      const fake = lastFakeConnector!;
      expect(fake.handler).toBeTypeOf('function');

      // Allowlisted sender + requireMention=false + a /run command => passes the
      // real gate and dispatches.
      await fake.handler!(inbound());

      expect(createWorkspace).toHaveBeenCalledTimes(1);
      const arg = createWorkspace.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.prompt).toBe('build the landing page');
      expect(arg.repoPath).toBe('/repos/demo');
      expect(arg.runtimeId).toBe('claude_code');
      expect(arg.spaceId).toBe('space_1');

      await gateway.stop();
      vi.clearAllTimers();
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes NO action for a non-gated message (sender not allowlisted)', async () => {
    const gateway = new ConnectorsGateway(
      configWith({ gating: { allowlist: ['bob'], requireMention: false } }),
    );
    await gateway.start();
    const fake = lastFakeConnector!;

    await fake.handler!(inbound({ sender: { SenderId: '42', SenderUsername: 'alice' } }));

    expect(createWorkspace).not.toHaveBeenCalled();
    await gateway.stop();
  });

  it('takes NO action when the message passes the gate but carries no command', async () => {
    // Allowlisted + requireMention=false => the gate passes regardless of
    // mention, but whitespace-only text parses to no actionable command, so the
    // gateway returns without dispatching (the `!command` branch).
    const gateway = new ConnectorsGateway(
      configWith({ gating: { allowlist: ['alice'], requireMention: false } }),
    );
    await gateway.start();
    const fake = lastFakeConnector!;

    await fake.handler!(inbound({ text: '   ' }));

    expect(createWorkspace).not.toHaveBeenCalled();
    await gateway.stop();
  });

  it('replies (no dispatch) when gated but dispatch is not configured', async () => {
    const gateway = new ConnectorsGateway(configWith({ dispatch: undefined }));
    await gateway.start();
    const fake = lastFakeConnector!;

    await fake.handler!(inbound());

    expect(createWorkspace).not.toHaveBeenCalled();
    // The gateway tells the operator dispatch is unconfigured rather than failing silently.
    expect(fake.sent.length).toBe(1);
    expect(fake.sent[0].text).toContain('dispatch is not configured');
    await gateway.stop();
  });
});

describe('ConnectorsGateway — inert when no channel configured', () => {
  it('is inactive and start() is a safe no-op (no token => no throw)', async () => {
    const gateway = new ConnectorsGateway({
      channels: [],
      dispatch: undefined,
      gating: { allowlist: [], requireMention: true },
    });

    expect(gateway.active).toBe(false);
    // Must not throw with nothing configured.
    await expect(gateway.start()).resolves.toBeUndefined();

    const health = await gateway.health();
    expect(health.active).toBe(false);
    expect(health.dispatchReady).toBe(false);
    expect(health.channels).toHaveLength(0);

    await expect(gateway.stop()).resolves.toBeUndefined();
    expect(createWorkspace).not.toHaveBeenCalled();
  });
});
