/**
 * Embedded-agent dispatch behind the verified ingress.
 *
 * What is REAL here (not stubbed):
 *   - The REAL package pipeline `dispatchInbound` (normalize -> gate ->
 *     embedded-runner -> port.send) runs, returning a genuine `DispatchOutcome`.
 *   - The REAL trust boundary (`makeAllowlistGatePolicy` -> `resolveGate`) gates
 *     every message: a non-allowlisted sender yields a real `blocked` outcome and
 *     NO send; an allowlisted sender drives the runner and a real `delivered`
 *     outcome with the reply sent over the port.
 *   - The `EmbeddedRunner` is a REAL implementation of the package's public
 *     `EmbeddedRunner` contract (a streaming async-iterable of `EmbeddedRunEvent`s)
 *     — NOT a mock of any internal — so the dispatch's `collectReplyText` folds
 *     genuine streamed text into the reply.
 *   - The `ConnectorPort` is an in-memory port at the SDK seam that records sends;
 *     its `send()` is the real method `dispatchInbound` invokes.
 *
 * Degrade-safe + truthful: with NO runner enabled, dispatch returns a truthful
 * `no-runner` result and sends NOTHING (never a faked delivered).
 */
import { describe, it, expect } from 'vitest';
import type {
  ConnectorKind,
  ConnectorMonitorHandle,
  ConnectorPort,
  ConnectorProbeResult,
  EmbeddedRunEvent,
  EmbeddedRunRequest,
  EmbeddedRunner,
  InboundHandler,
  NormalizedInboundMessage,
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from '@recoder/connectors';
import { ConnectorAgentDispatcher, type PortSource } from './dispatch-runner';
import type { GatingConfig } from './config';

/** A real in-memory ConnectorPort: records sends; other methods are inert-real. */
class RecordingPort implements ConnectorPort {
  readonly sent: OutboundMessage[] = [];
  constructor(readonly kind: ConnectorKind) {}
  async monitor(_a: string, _h: InboundHandler): Promise<ConnectorMonitorHandle> {
    return { stop: async () => {} };
  }
  async send(message: OutboundMessage): Promise<SendResult> {
    this.sent.push(message);
    return { delivered: true, messageIds: ['sent-1'] };
  }
  async probe(accountId: string): Promise<ConnectorProbeResult> {
    return { channel: this.kind, accountId, ready: true, checkedAt: Date.now() };
  }
  normalize(): NormalizedInboundMessage | undefined {
    return undefined;
  }
  async react(_r: ReactionRequest): Promise<boolean> {
    return true;
  }
}

/** A real EmbeddedRunner: streams a fixed reply as genuine text events + done. */
class EchoRunner implements EmbeddedRunner {
  readonly seen: EmbeddedRunRequest[] = [];
  constructor(private readonly reply: string) {}
  run(request: EmbeddedRunRequest): AsyncIterable<EmbeddedRunEvent> {
    this.seen.push(request);
    const reply = this.reply;
    return (async function* (): AsyncIterable<EmbeddedRunEvent> {
      // Stream the reply in two deltas to exercise the real fold in collectReplyText.
      yield { type: 'text', text: reply.slice(0, 3) };
      yield { type: 'text', text: reply.slice(3) };
      yield { type: 'done', usage: { inputTokens: 5, outputTokens: 7 } };
    })();
  }
}

class SinglePortSource implements PortSource {
  constructor(private readonly port: ConnectorPort) {}
  getChannelPort(channel: string): ConnectorPort | null {
    return channel === this.port.kind ? this.port : null;
  }
}

function inbound(overrides: Partial<NormalizedInboundMessage> = {}): NormalizedInboundMessage {
  return {
    channel: 'discord',
    accountId: 'acct_1',
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

const GATING_ALLOW_ALICE: GatingConfig = { allowlist: ['alice'], requireMention: false };
const GATING_ALLOW_BOB: GatingConfig = { allowlist: ['bob'], requireMention: false };

describe('ConnectorAgentDispatcher — embedded-agent dispatch (real dispatchInbound)', () => {
  it('an allowlisted message drives the runner and delivers the reply over the port (real DispatchOutcome)', async () => {
    const port = new RecordingPort('discord');
    const runner = new EchoRunner('echo: got it');
    const dispatcher = new ConnectorAgentDispatcher({
      ports: new SinglePortSource(port),
      gating: GATING_ALLOW_ALICE,
      runner,
    });
    expect(dispatcher.ready).toBe(true);

    const result = await dispatcher.dispatch(inbound());
    expect(result.kind).toBe('dispatched');
    if (result.kind !== 'dispatched') throw new Error('expected dispatched');
    expect(result.outcome.status).toBe('delivered');
    if (result.outcome.status !== 'delivered') throw new Error('expected delivered');
    expect(result.outcome.reply).toBe('echo: got it');

    // The reply was REALLY sent over the port to the originating conversation.
    expect(port.sent).toHaveLength(1);
    expect(port.sent[0].text).toBe('echo: got it');
    expect(port.sent[0].target.conversationId).toBe('c1');
    expect(port.sent[0].target.replyTo).toBe('m1');

    // The runner really received the prompt + a per-conversation session id.
    expect(runner.seen).toHaveLength(1);
    expect(runner.seen[0].prompt).toBe('hello there');
    expect(runner.seen[0].sessionId).toBe('discord:acct_1:c1');
  });

  it('a NON-allowlisted sender is BLOCKED by the real gate: no runner turn, no send', async () => {
    const port = new RecordingPort('discord');
    const runner = new EchoRunner('should not run');
    const dispatcher = new ConnectorAgentDispatcher({
      ports: new SinglePortSource(port),
      gating: GATING_ALLOW_BOB, // alice is NOT allowed
      runner,
    });

    const result = await dispatcher.dispatch(inbound());
    expect(result.kind).toBe('dispatched');
    if (result.kind !== 'dispatched') throw new Error('expected dispatched');
    expect(result.outcome.status).toBe('blocked');
    // Hostile-by-default: blocked -> no agent turn, no send.
    expect(runner.seen).toHaveLength(0);
    expect(port.sent).toHaveLength(0);
  });

  it('with NO runner enabled, dispatch returns a truthful no-runner result and sends nothing', async () => {
    const port = new RecordingPort('discord');
    // No injected runner + CONNECTORS_AGENT_ENABLED unset -> not ready.
    const prev = process.env.CONNECTORS_AGENT_ENABLED;
    delete process.env.CONNECTORS_AGENT_ENABLED;
    try {
      const dispatcher = new ConnectorAgentDispatcher({
        ports: new SinglePortSource(port),
        gating: GATING_ALLOW_ALICE,
      });
      expect(dispatcher.ready).toBe(false);

      const result = await dispatcher.dispatch(inbound());
      expect(result.kind).toBe('no-runner');
      if (result.kind !== 'no-runner') throw new Error('expected no-runner');
      expect(result.reason).toMatch(/embedded agent runner not configured/i);
      // Truthful: nothing was sent — no fake delivered.
      expect(port.sent).toHaveLength(0);
    } finally {
      if (prev === undefined) delete process.env.CONNECTORS_AGENT_ENABLED;
      else process.env.CONNECTORS_AGENT_ENABLED = prev;
    }
  });

  it('an unknown channel (no live port) returns a truthful no-port result', async () => {
    const port = new RecordingPort('discord');
    const runner = new EchoRunner('hi');
    const dispatcher = new ConnectorAgentDispatcher({
      ports: new SinglePortSource(port),
      gating: GATING_ALLOW_ALICE,
      runner,
    });
    const result = await dispatcher.dispatch(inbound({ channel: 'telegram' }));
    expect(result.kind).toBe('no-port');
    expect(port.sent).toHaveLength(0);
  });

  it('an empty agent reply is reported as a truthful "empty" outcome, not a blank send', async () => {
    const port = new RecordingPort('discord');
    const runner = new EchoRunner('   '); // whitespace-only -> empty reply
    const dispatcher = new ConnectorAgentDispatcher({
      ports: new SinglePortSource(port),
      gating: GATING_ALLOW_ALICE,
      runner,
    });
    const result = await dispatcher.dispatch(inbound());
    expect(result.kind).toBe('dispatched');
    if (result.kind !== 'dispatched') throw new Error('expected dispatched');
    expect(result.outcome.status).toBe('empty');
    expect(port.sent).toHaveLength(0);
  });
});
