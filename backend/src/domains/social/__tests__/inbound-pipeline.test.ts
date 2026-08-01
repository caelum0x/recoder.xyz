/**
 * `inbound-pipeline` — the end-to-end trust-boundary orchestrator one inbound
 * channel message travels: DEDUP → TRUST (mention gate) → DISPATCH → REPLY →
 * AUDIT. These tests lock in the fail-closed invariants:
 *   - a gate REJECT is a clean drop that NEVER reaches dispatch and is recorded
 *     truthfully as `rejected` with its reason;
 *   - a duplicate provider message is dropped before the gate ever runs;
 *   - a dispatch error is audited truthfully (no faked run id, no faked reply);
 *   - a failed reply send is surfaced (`replied:false`), never faked delivered;
 *   - every admitted outcome is recorded once via `recordInbound` (the dedup guard).
 *
 * All collaborators are injected fakes (ports) — no DB, no network.
 */
import { describe, it, expect } from 'vitest';
import { createInboundPipeline } from '../dispatch/inbound-pipeline.js';
import type { InboundPipelineDeps } from '../dispatch/inbound-pipeline.js';
import type { SocialRepository } from '../ports/social-repository.port.js';
import type { MentionGate } from '../ports/mention-gate.port.js';
import type { DispatchPort } from '../ports/dispatch.port.js';
import type { ChannelAdapterRegistry } from '../adapters/channel-adapter-registry.js';
import type {
  ChannelId,
  DispatchOutcome,
  InboundEnvelope,
  InboundLogEntry,
  MentionDecision,
} from '../types.js';
import type { OutboundMessage, SendResult } from '../ports/connector-port.js';

// --- injectable fakes --------------------------------------------------------

function makeEnvelope(over: Partial<InboundEnvelope> = {}): InboundEnvelope {
  return {
    channel: 'telegram',
    chatRef: 'chat-1',
    senderId: 'user-1',
    providerMsgId: 'pm-1',
    text: '/run do a thing',
    ...over,
  };
}

interface RepoState {
  seen: boolean;
  seenThrows?: boolean;
  recorded: InboundLogEntry[];
  wasSeenCalls: Array<{ connectorId: string; providerMsg: string }>;
}

function makeRepo(state: RepoState): SocialRepository {
  return {
    async upsertConnector() {
      throw new Error('not used');
    },
    async listConnectors() {
      return [];
    },
    async upsertBinding() {
      throw new Error('not used');
    },
    async listBindings() {
      return [];
    },
    async getBinding() {
      return null;
    },
    async removeBinding() {
      return false;
    },
    async recordInbound(entry: InboundLogEntry) {
      state.recorded.push(entry);
    },
    async wasSeen(connectorId: string, providerMsg: string) {
      state.wasSeenCalls.push({ connectorId, providerMsg });
      if (state.seenThrows) throw new Error('db down');
      return state.seen;
    },
  };
}

function makeGate(decision: MentionDecision, spy?: { calls: InboundEnvelope[] }): MentionGate {
  return {
    async admit(env: InboundEnvelope) {
      spy?.calls.push(env);
      return decision;
    },
  };
}

interface DispatchState {
  conductorCalls: number;
  replyCalls: number;
  conductorOutcome: DispatchOutcome;
  replyOutcome: DispatchOutcome;
}

function makeDispatch(state: DispatchState): DispatchPort {
  return {
    async dispatchToConductor() {
      state.conductorCalls += 1;
      return state.conductorOutcome;
    },
    async replyInChannel() {
      state.replyCalls += 1;
      return state.replyOutcome;
    },
  };
}

interface ChannelsState {
  sendCalls: Array<{ channel: ChannelId; message: OutboundMessage }>;
  sendResult: SendResult;
}

function makeChannels(state: ChannelsState): ChannelAdapterRegistry {
  return {
    async get() {
      return null;
    },
    async send(channel: ChannelId, message: OutboundMessage) {
      state.sendCalls.push({ channel, message });
      return state.sendResult;
    },
    async statuses() {
      return [];
    },
  };
}

function build(over: Partial<InboundPipelineDeps> & {
  repoState?: RepoState;
  gateDecision?: MentionDecision;
  gateSpy?: { calls: InboundEnvelope[] };
  dispatchState?: DispatchState;
  channelsState?: ChannelsState;
} = {}) {
  const repoState: RepoState = over.repoState ?? { seen: false, recorded: [], wasSeenCalls: [] };
  const gateDecision: MentionDecision =
    over.gateDecision ?? { admitted: false, code: 'not_allowlisted', reason: 'not on allowlist' };
  const dispatchState: DispatchState = over.dispatchState ?? {
    conductorCalls: 0,
    replyCalls: 0,
    conductorOutcome: { kind: 'conductor', runId: 'run-1' },
    replyOutcome: { kind: 'reply', reply: 'hello' },
  };
  const channelsState: ChannelsState = over.channelsState ?? {
    sendCalls: [],
    sendResult: { delivered: true, messageIds: ['m1'] },
  };
  const deps: InboundPipelineDeps = {
    repository: over.repository ?? makeRepo(repoState),
    mentionGate: over.mentionGate ?? makeGate(gateDecision, over.gateSpy),
    dispatch: over.dispatch ?? makeDispatch(dispatchState),
    channels: over.channels ?? makeChannels(channelsState),
    ...(over.connectorIdFor ? { connectorIdFor: over.connectorIdFor } : {}),
  };
  return { pipeline: createInboundPipeline(deps), repoState, dispatchState, channelsState };
}

describe('inbound-pipeline trust boundary', () => {
  it('FAIL-CLOSED: a rejected message never reaches dispatch and is audited as rejected', async () => {
    const gateSpy = { calls: [] as InboundEnvelope[] };
    const { pipeline, repoState, dispatchState, channelsState } = build({
      gateDecision: { admitted: false, code: 'not_allowlisted', reason: 'sender not on allowlist' },
      gateSpy,
    });

    const result = await pipeline.ingest(makeEnvelope());

    expect(result.deduped).toBe(false);
    expect(result.decision?.admitted).toBe(false);
    // dispatch is NEVER invoked for a rejected message.
    expect(dispatchState.conductorCalls).toBe(0);
    expect(dispatchState.replyCalls).toBe(0);
    expect(channelsState.sendCalls).toHaveLength(0);
    // The rejection is recorded truthfully with its reason.
    expect(repoState.recorded).toHaveLength(1);
    expect(repoState.recorded[0]).toMatchObject({
      decision: 'rejected',
      reason: 'sender not on allowlist',
    });
    expect(repoState.recorded[0]?.runId).toBeUndefined();
    expect(gateSpy.calls).toHaveLength(1);
  });

  it('DEDUP: a duplicate provider message is dropped before the gate runs', async () => {
    const gateSpy = { calls: [] as InboundEnvelope[] };
    const { pipeline, repoState, dispatchState } = build({
      repoState: { seen: true, recorded: [], wasSeenCalls: [] },
      gateSpy,
    });

    const result = await pipeline.ingest(makeEnvelope());

    expect(result).toEqual({ deduped: true });
    // No trust decision, no dispatch, no new audit row on a duplicate.
    expect(gateSpy.calls).toHaveLength(0);
    expect(dispatchState.conductorCalls).toBe(0);
    expect(repoState.recorded).toHaveLength(0);
  });

  it('admitted /run → conductor: records admitted with dispatchKind + runId, no faked reply send', async () => {
    const { pipeline, repoState, dispatchState, channelsState } = build({
      gateDecision: {
        admitted: true,
        code: 'admitted',
        reason: 'ok',
        command: { command: 'run', args: 'do a thing' },
        dispatchKind: 'conductor',
      },
      dispatchState: {
        conductorCalls: 0,
        replyCalls: 0,
        conductorOutcome: { kind: 'conductor', runId: 'run-42' },
        replyOutcome: { kind: 'reply', reply: 'unused' },
      },
    });

    const result = await pipeline.ingest(makeEnvelope());

    expect(dispatchState.conductorCalls).toBe(1);
    expect(dispatchState.replyCalls).toBe(0);
    expect(result.outcome?.runId).toBe('run-42');
    // A conductor dispatch produces no channel reply.
    expect(channelsState.sendCalls).toHaveLength(0);
    expect(result.replied).toBe(false);
    expect(repoState.recorded).toHaveLength(1);
    expect(repoState.recorded[0]).toMatchObject({
      decision: 'admitted',
      dispatchKind: 'conductor',
      runId: 'run-42',
    });
  });

  it('admitted reply: delivered reply sets replied:true and sends over the channel', async () => {
    const { pipeline, channelsState, repoState } = build({
      gateDecision: { admitted: true, code: 'admitted', reason: 'ok', dispatchKind: 'reply' },
      dispatchState: {
        conductorCalls: 0,
        replyCalls: 0,
        conductorOutcome: { kind: 'conductor', runId: 'x' },
        replyOutcome: { kind: 'reply', reply: 'here is your answer' },
      },
      channelsState: { sendCalls: [], sendResult: { delivered: true, messageIds: ['m9'] } },
    });

    const result = await pipeline.ingest(makeEnvelope({ chatRef: 'room-9', providerMsgId: 'pm-9' }));

    expect(result.replied).toBe(true);
    expect(channelsState.sendCalls).toHaveLength(1);
    expect(channelsState.sendCalls[0]?.message.text).toBe('here is your answer');
    expect(channelsState.sendCalls[0]?.message.target).toMatchObject({
      conversationId: 'room-9',
      replyTo: 'pm-9',
    });
    // Admitted with a (non-'none') reply dispatchKind is audited.
    expect(repoState.recorded[0]).toMatchObject({ decision: 'admitted', dispatchKind: 'reply' });
  });

  it('NEVER FAKES SUCCESS: a failed reply send surfaces replied:false', async () => {
    const { pipeline, channelsState } = build({
      gateDecision: { admitted: true, code: 'admitted', reason: 'ok', dispatchKind: 'reply' },
      dispatchState: {
        conductorCalls: 0,
        replyCalls: 0,
        conductorOutcome: { kind: 'conductor', runId: 'x' },
        replyOutcome: { kind: 'reply', reply: 'attempted reply' },
      },
      channelsState: { sendCalls: [], sendResult: { delivered: false, messageIds: [] } },
    });

    const result = await pipeline.ingest(makeEnvelope());

    expect(channelsState.sendCalls).toHaveLength(1);
    expect(result.replied).toBe(false);
  });

  it('TRUTHFUL AUDIT: a dispatch error is recorded as its reason, with no faked run id', async () => {
    const { pipeline, repoState, channelsState } = build({
      gateDecision: { admitted: true, code: 'admitted', reason: 'ok', dispatchKind: 'reply' },
      dispatchState: {
        conductorCalls: 0,
        replyCalls: 0,
        conductorOutcome: { kind: 'conductor', runId: 'x' },
        // Degrade-safe: dependency absent ⇒ error outcome, never a fabricated reply.
        replyOutcome: { kind: 'none', error: 'inference gateway unavailable' },
      },
    });

    const result = await pipeline.ingest(makeEnvelope());

    expect(result.outcome?.error).toBe('inference gateway unavailable');
    expect(result.replied).toBe(false);
    // No reply text ⇒ no channel send attempted.
    expect(channelsState.sendCalls).toHaveLength(0);
    expect(repoState.recorded).toHaveLength(1);
    expect(repoState.recorded[0]).toMatchObject({ decision: 'admitted', reason: 'inference gateway unavailable' });
    expect(repoState.recorded[0]?.runId).toBeUndefined();
  });

  it('routes conductor-kind WITHOUT a command to the reply agent (command required for conductor)', async () => {
    const { pipeline, dispatchState } = build({
      // dispatchKind says conductor but no parsed command ⇒ falls through to reply.
      gateDecision: { admitted: true, code: 'admitted', reason: 'ok', dispatchKind: 'conductor' },
    });

    await pipeline.ingest(makeEnvelope());

    expect(dispatchState.conductorCalls).toBe(0);
    expect(dispatchState.replyCalls).toBe(1);
  });

  it('uses connectorIdFor to derive the audit connector id and dedup key', async () => {
    const gateSpy = { calls: [] as InboundEnvelope[] };
    const { pipeline, repoState } = build({
      gateDecision: { admitted: false, code: 'not_mentioned', reason: 'no mention' },
      gateSpy,
      connectorIdFor: (channel) => `conn-${channel}`,
    });

    await pipeline.ingest(makeEnvelope({ channel: 'slack', providerMsgId: 'pm-x' }));

    expect(repoState.wasSeenCalls[0]).toEqual({ connectorId: 'conn-slack', providerMsg: 'pm-x' });
    expect(repoState.recorded[0]?.connectorId).toBe('conn-slack');
  });

  it('DEGRADE-SAFE: a wasSeen fault is swallowed and the message proceeds (not treated as seen)', async () => {
    const gateSpy = { calls: [] as InboundEnvelope[] };
    const { pipeline } = build({
      repoState: { seen: false, seenThrows: true, recorded: [], wasSeenCalls: [] },
      gateDecision: { admitted: false, code: 'not_allowlisted', reason: 'nope' },
      gateSpy,
    });

    const result = await pipeline.ingest(makeEnvelope());

    // A dedup-store fault must NOT silently drop the message; the gate still runs.
    expect(result.deduped).toBe(false);
    expect(gateSpy.calls).toHaveLength(1);
  });
});
