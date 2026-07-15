/**
 * Mention gate trust boundary — hostile-by-default admission. Empty allowlist
 * admits nothing; an allowlisted mention/command admits; `/run` routes to the
 * conductor, a plain mention to the reply agent; a failed signed vouch drops.
 */
import { describe, it, expect } from 'vitest';
import { createHostileMentionGate, parseCommand } from '../adapters/mention-gate.adapter.js';
import type { InboundEnvelope } from '../types.js';

function inbound(over: Partial<InboundEnvelope> = {}): InboundEnvelope {
  return {
    channel: 'telegram',
    chatRef: 'chat-1',
    senderId: 'alice',
    providerMsgId: 'm1',
    text: 'hello',
    ...over,
  };
}

describe('mention gate (hostile-by-default)', () => {
  it('rejects everything when the allowlist is empty and there is no binding', async () => {
    const gate = createHostileMentionGate({ config: { allowlist: [], requireMention: true } });
    const d = await gate.admit(inbound({ mentioned: true, text: '@bot hi' }));
    expect(d.admitted).toBe(false);
    expect(d.code).toBe('allowlist_empty');
  });

  it('rejects a non-allowlisted sender', async () => {
    const gate = createHostileMentionGate({ config: { allowlist: ['bob'], requireMention: false } });
    const d = await gate.admit(inbound({ senderId: 'alice' }));
    expect(d.admitted).toBe(false);
    expect(d.code).toBe('not_allowlisted');
  });

  it('requires a mention or command in a channel when requireMention is on', async () => {
    const gate = createHostileMentionGate({ config: { allowlist: ['alice'], requireMention: true } });
    const d = await gate.admit(inbound({ text: 'just chatter', mentioned: false }));
    expect(d.admitted).toBe(false);
    expect(d.code).toBe('not_mentioned');
  });

  it('admits an allowlisted /run command → conductor dispatch', async () => {
    const gate = createHostileMentionGate({ config: { allowlist: ['alice'], requireMention: true } });
    const d = await gate.admit(inbound({ text: '/run fix the flaky test' }));
    expect(d.admitted).toBe(true);
    expect(d.dispatchKind).toBe('conductor');
    expect(d.command).toEqual({ command: 'run', args: 'fix the flaky test' });
  });

  it('admits an allowlisted plain mention → reply agent turn', async () => {
    const gate = createHostileMentionGate({ config: { allowlist: ['*'], requireMention: true } });
    const d = await gate.admit(inbound({ text: '@bot what is the status?', mentioned: true }));
    expect(d.admitted).toBe(true);
    expect(d.dispatchKind).toBe('reply');
  });

  it('admits via an explicit binding even when the static allowlist is empty', async () => {
    const gate = createHostileMentionGate({
      config: { allowlist: [], requireMention: false },
      bindingCheck: { isChatAllowed: () => true },
    });
    const d = await gate.admit(inbound({ text: '/run go' }));
    expect(d.admitted).toBe(true);
  });

  it('drops an otherwise-admitted message when the signed vouch fails', async () => {
    const gate = createHostileMentionGate({
      config: { allowlist: ['alice'], requireMention: false },
      signedVouch: { vouch: () => false },
    });
    const d = await gate.admit(inbound({ text: '/run go' }));
    expect(d.admitted).toBe(false);
    expect(d.code).toBe('vouch_rejected');
  });

  it('never throws on hostile input; parseCommand handles bare text', async () => {
    const gate = createHostileMentionGate({ config: { allowlist: ['alice'], requireMention: false } });
    await expect(gate.admit(inbound({ text: '' }))).resolves.toBeDefined();
    expect(parseCommand('no command here')).toEqual({ args: 'no command here' });
    expect(parseCommand('/deploy prod now')).toEqual({ command: 'deploy', args: 'prod now' });
  });
});
