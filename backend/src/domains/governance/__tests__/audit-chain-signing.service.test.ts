import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { AuditChainService } from '../services/audit-chain.service.js';
import { createAuditTipSigner } from '../adapters/audit-signer.adapter.js';
import { InMemoryAuditRepository } from './_fakes.js';
import type { AuditEntryInput } from '../types.js';

function seed(): string {
  return crypto.randomBytes(32).toString('base64');
}

function makeEntry(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  return {
    actorId: 'u1',
    action: 'file.write',
    resource: '/repo/a.ts',
    effect: 'allow',
    riskTier: 'medium',
    degraded: false,
    payload: { k: 'v' },
    ...overrides,
  };
}

describe('AuditChainService — additive server signature over the tip hash', () => {
  it('signTip signs the CURRENT tip content hash and reports signing enabled', async () => {
    const repo = new InMemoryAuditRepository();
    const signer = createAuditTipSigner({ auditSigningKey: seed() });
    const svc = new AuditChainService(repo, undefined, undefined, signer);

    await svc.append(makeEntry({ resource: '/a' }));
    const tip = (await svc.tip())!;

    const sig = await svc.signTip();
    expect(svc.signingEnabled).toBe(true);
    expect(svc.signerPublicKey).toBe(signer.publicKey);
    expect(sig).not.toBeNull();
    expect(sig!.contentHash).toBe(tip.entryHash);
    expect(sig!.tipSeq).toBe(tip.seq);
    expect(sig!.algorithm).toBe('ed25519');
  });

  it('verifyTip PROVES the current tip was produced by this server', async () => {
    const repo = new InMemoryAuditRepository();
    const svc = new AuditChainService(
      repo,
      undefined,
      undefined,
      createAuditTipSigner({ auditSigningKey: seed() }),
    );
    await svc.append(makeEntry());

    const sig = (await svc.signTip())!;
    // Accepts the full artifact...
    expect(await svc.verifyTip(sig)).toBe(true);
    // ...and a raw detached signature string against the current tip.
    expect(await svc.verifyTip(sig.signature)).toBe(true);
    // ...and an explicitly-supplied public key.
    expect(await svc.verifyTip(sig, svc.signerPublicKey)).toBe(true);
  });

  it('a signature over an OLD tip fails once the chain advances (bound to current tip)', async () => {
    const repo = new InMemoryAuditRepository();
    const svc = new AuditChainService(
      repo,
      undefined,
      undefined,
      createAuditTipSigner({ auditSigningKey: seed() }),
    );
    await svc.append(makeEntry({ resource: '/a' }));
    const oldSig = (await svc.signTip())!;
    expect(await svc.verifyTip(oldSig)).toBe(true);

    // Advance the tip; the old artifact's contentHash no longer matches.
    await svc.append(makeEntry({ resource: '/b' }));
    expect(await svc.verifyTip(oldSig)).toBe(false);
    // A raw string of the old signature also fails against the new tip hash.
    expect(await svc.verifyTip(oldSig.signature)).toBe(false);
  });

  it('verifyTip REJECTS a signature from a DIFFERENT server key', async () => {
    const repo = new InMemoryAuditRepository();
    const svc = new AuditChainService(
      repo,
      undefined,
      undefined,
      createAuditTipSigner({ auditSigningKey: seed() }),
    );
    await svc.append(makeEntry());
    const tip = (await svc.tip())!;

    // A rogue signer signs the same tip hash with a foreign key.
    const rogue = createAuditTipSigner({ auditSigningKey: seed() });
    const rogueSig = rogue.signHash(tip.entryHash, tip.seq)!;

    // Against the server's own key ⇒ rejected.
    expect(await svc.verifyTip(rogueSig.signature)).toBe(false);
    // The artifact carries the rogue public key, but it's not this server's key.
    expect(await svc.verifyTip(rogueSig)).toBe(true); // valid FOR the rogue key it names
    // Pinning to the server's real key rejects it.
    expect(await svc.verifyTip(rogueSig.signature, svc.signerPublicKey)).toBe(false);
  });

  describe('degrade-truthful', () => {
    it('no signer wired ⇒ signTip null, verifyTip false, signingEnabled false', async () => {
      const repo = new InMemoryAuditRepository();
      const svc = new AuditChainService(repo);
      await svc.append(makeEntry());
      expect(svc.signingEnabled).toBe(false);
      expect(svc.signerPublicKey).toBeNull();
      expect(await svc.signTip()).toBeNull();
      expect(await svc.verifyTip('anything')).toBe(false);
    });

    it('unavailable signer (no key) ⇒ UNSIGNED tip, never a forged signature', async () => {
      const repo = new InMemoryAuditRepository();
      const svc = new AuditChainService(
        repo,
        undefined,
        undefined,
        createAuditTipSigner({ auditSigningKey: null }),
      );
      await svc.append(makeEntry());
      expect(svc.signingEnabled).toBe(false);
      expect(await svc.signTip()).toBeNull();
    });

    it('empty chain ⇒ signTip null (nothing to sign)', async () => {
      const repo = new InMemoryAuditRepository();
      const svc = new AuditChainService(
        repo,
        undefined,
        undefined,
        createAuditTipSigner({ auditSigningKey: seed() }),
      );
      expect(await svc.signTip()).toBeNull();
      expect(await svc.verifyTip('sig')).toBe(false);
    });

    it('an unavailable signer can still act as an EXTERNAL verifier with a supplied key', async () => {
      // The server holds no key (unsigned locally) but can verify a signature
      // produced elsewhere over its current tip hash, given that party's pubkey.
      const repo = new InMemoryAuditRepository();
      const svc = new AuditChainService(
        repo,
        undefined,
        undefined,
        createAuditTipSigner({ auditSigningKey: null }),
      );
      await svc.append(makeEntry());
      const tip = (await svc.tip())!;

      const external = createAuditTipSigner({ auditSigningKey: seed() });
      const extSig = external.signHash(tip.entryHash, tip.seq)!;
      expect(await svc.verifyTip(extSig.signature, external.publicKey)).toBe(true);
      expect(await svc.verifyTip(extSig.signature)).toBe(false); // no default key held
    });
  });
});
