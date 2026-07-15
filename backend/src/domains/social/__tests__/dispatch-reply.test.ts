/**
 * `dispatch-reply` — the conversational half of the DispatchPort. Proves the
 * degrade-safe contract: a genuine gateway reply is passed through verbatim, and
 * every failure mode (no inference wired, gateway `ok:false`, empty text, thrown
 * fault) yields a truthful `error` outcome — NEVER a fabricated reply.
 */
import { describe, it, expect } from 'vitest';
import { createReplyAgent, type ReplyInferencePort } from '../dispatch/reply-agent.js';
import type { InboundEnvelope } from '../types.js';

const INBOUND: InboundEnvelope = {
  channel: 'telegram',
  chatRef: 'chat-1',
  senderId: 'user-9',
  providerMsgId: 'm-1',
  text: 'hello agent',
};

function inference(impl: ReplyInferencePort['reply']): ReplyInferencePort {
  return { reply: impl };
}

describe('dispatch reply-agent', () => {
  it('passes through a genuine gateway reply verbatim', async () => {
    const agent = createReplyAgent({
      inference: inference(async ({ text }) => ({ ok: true, text: `echo:${text}` })),
    });
    const out = await agent(INBOUND);
    expect(out.kind).toBe('reply');
    expect(out.reply).toBe('echo:hello agent');
    expect(out.error).toBeUndefined();
  });

  it('errors truthfully when no inference gateway is wired (never fabricates)', async () => {
    const agent = createReplyAgent({});
    const out = await agent(INBOUND);
    expect(out.kind).toBe('reply');
    expect(out.reply).toBeUndefined();
    expect(out.error).toMatch(/not wired/i);
  });

  it('surfaces the gateway reason on ok:false', async () => {
    const agent = createReplyAgent({
      inference: inference(async () => ({ ok: false, reason: 'rate limited' })),
    });
    const out = await agent(INBOUND);
    expect(out.reply).toBeUndefined();
    expect(out.error).toBe('rate limited');
  });

  it('errors on an empty reply rather than emitting a blank message', async () => {
    const agent = createReplyAgent({
      inference: inference(async () => ({ ok: true, text: '' })),
    });
    const out = await agent(INBOUND);
    expect(out.reply).toBeUndefined();
    expect(out.error).toBeTruthy();
  });

  it('never throws when the gateway faults — degrades to a truthful error', async () => {
    const agent = createReplyAgent({
      inference: inference(async () => {
        throw new Error('boom');
      }),
    });
    const out = await agent(INBOUND);
    expect(out.reply).toBeUndefined();
    expect(out.error).toBeTruthy();
  });

  it('forwards the inbound envelope fields to the gateway', async () => {
    let seen: Parameters<ReplyInferencePort['reply']>[0] | null = null;
    const agent = createReplyAgent({
      inference: inference(async (input) => {
        seen = input;
        return { ok: true, text: 'ok' };
      }),
    });
    await agent(INBOUND);
    expect(seen).toEqual({
      channel: 'telegram',
      chatRef: 'chat-1',
      senderId: 'user-9',
      text: 'hello agent',
    });
  });
});
