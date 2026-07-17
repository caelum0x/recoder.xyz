/**
 * `signed-vouch.adapter` — the real SignedVouch over the connector-ingress HMAC
 * secret. Proves the degrade law (no secret ⇒ inert, factory yields null — the
 * gate skips, never a faked vouch) and the seal→verify round-trip re-admission.
 */
import { describe, it, expect } from 'vitest';
import { createSealedIngressVouch } from '../adapters/signed-vouch.adapter.js';
import type { InboundEnvelope } from '../types.js';

const ENV: InboundEnvelope = {
  channel: 'telegram',
  chatRef: 'chat-42',
  senderId: 'user-7',
  providerMsgId: 'msg-1001',
  text: '/run fix the failing test',
  mentioned: true,
};

describe('createSealedIngressVouch', () => {
  it('no secret ⇒ null (inert — the mention gate skips the vouch step)', () => {
    expect(createSealedIngressVouch({ secret: null })).toBeNull();
    expect(createSealedIngressVouch({ secret: '' })).toBeNull();
    expect(createSealedIngressVouch({ secret: '   ' })).toBeNull();
  });

  it('configured secret ⇒ the seal→verify round-trip re-admits the envelope', async () => {
    const vouch = createSealedIngressVouch({
      secret: 'shared-ingress-secret',
      now: () => new Date('2026-07-17T00:00:00.000Z'),
    });
    expect(vouch).not.toBeNull();
    await expect(Promise.resolve(vouch!.vouch(ENV))).resolves.toBe(true);
  });

  it('vouches deterministically for the same envelope + secret (canonical bytes)', async () => {
    const vouch = createSealedIngressVouch({ secret: 's3cret' });
    const first = await Promise.resolve(vouch!.vouch(ENV));
    const second = await Promise.resolve(vouch!.vouch({ ...ENV }));
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('handles an envelope without the optional mentioned flag', async () => {
    const vouch = createSealedIngressVouch({ secret: 's3cret' });
    const { mentioned: _dropped, ...rest } = ENV;
    await expect(Promise.resolve(vouch!.vouch(rest as InboundEnvelope))).resolves.toBe(true);
  });
});
