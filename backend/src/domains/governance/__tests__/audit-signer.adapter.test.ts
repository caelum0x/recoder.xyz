import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  createAuditTipSigner,
  AUDIT_SIGNATURE_ALGORITHM,
} from '../adapters/audit-signer.adapter.js';

/** A fresh, valid base64-encoded 32-byte ed25519 seed. */
function seed(): string {
  return crypto.randomBytes(32).toString('base64');
}

/** A sample tip content hash (64 hex chars, like `AuditRecord.entryHash`). */
function sampleHash(byte = 0xab): string {
  return Buffer.alloc(32, byte).toString('hex');
}

describe('createAuditTipSigner — server-held detached signature over the tip hash', () => {
  it('is available with a valid seed and exposes a public key + stable key id', () => {
    const signer = createAuditTipSigner({ auditSigningKey: seed() });
    expect(signer.available).toBe(true);
    expect(signer.algorithm).toBe(AUDIT_SIGNATURE_ALGORITHM);
    expect(signer.publicKey).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(signer.publicKey!, 'base64')).toHaveLength(32);
    expect(signer.keyId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('signHash produces a detached artifact that verifyHash accepts (round-trip)', () => {
    const signer = createAuditTipSigner({ auditSigningKey: seed() });
    const hash = sampleHash();

    const sig = signer.signHash(hash, 7)!;
    expect(sig).not.toBeNull();
    expect(sig.algorithm).toBe('ed25519');
    expect(sig.contentHash).toBe(hash);
    expect(sig.tipSeq).toBe(7);
    expect(sig.publicKey).toBe(signer.publicKey);
    expect(sig.keyId).toBe(signer.keyId);
    expect(Buffer.from(sig.signature, 'base64')).toHaveLength(64); // ed25519 sig size

    // Verify with the server's own (default) key and with the explicit key.
    expect(signer.verifyHash(hash, sig.signature)).toBe(true);
    expect(signer.verifyHash(hash, sig.signature, sig.publicKey)).toBe(true);
  });

  it('verifyHash REJECTS a signature over a different hash (authorship is hash-bound)', () => {
    const signer = createAuditTipSigner({ auditSigningKey: seed() });
    const sig = signer.signHash(sampleHash(0x11), 1)!;
    expect(signer.verifyHash(sampleHash(0x22), sig.signature)).toBe(false);
  });

  it('verifyHash REJECTS a tampered signature', () => {
    const signer = createAuditTipSigner({ auditSigningKey: seed() });
    const hash = sampleHash();
    const sig = signer.signHash(hash, 1)!;
    const bytes = Buffer.from(sig.signature, 'base64');
    bytes[0] ^= 0xff; // flip a byte
    expect(signer.verifyHash(hash, bytes.toString('base64'))).toBe(false);
  });

  it('verifyHash REJECTS a signature made by a DIFFERENT server key', () => {
    const a = createAuditTipSigner({ auditSigningKey: seed() });
    const b = createAuditTipSigner({ auditSigningKey: seed() });
    const hash = sampleHash();
    const sigA = a.signHash(hash, 1)!;
    // b's default key cannot verify a's signature (proves THIS-server authorship).
    expect(b.verifyHash(hash, sigA.signature)).toBe(false);
    // But a's own public key verifies it regardless of which signer runs verify.
    expect(b.verifyHash(hash, sigA.signature, a.publicKey)).toBe(true);
  });

  it('two signers from the SAME seed yield the same public key + key id (deterministic)', () => {
    const s = seed();
    const a = createAuditTipSigner({ auditSigningKey: s });
    const b = createAuditTipSigner({ auditSigningKey: s });
    expect(a.publicKey).toBe(b.publicKey);
    expect(a.keyId).toBe(b.keyId);
    // A signature from one verifies under the other's identical key.
    const sig = a.signHash(sampleHash(), 1)!;
    expect(b.verifyHash(sig.contentHash, sig.signature)).toBe(true);
  });

  it('accepts a PEM ed25519 private key as the signing key', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const signer = createAuditTipSigner({ auditSigningKey: pem });
    expect(signer.available).toBe(true);
    const sig = signer.signHash(sampleHash(), 1)!;
    expect(signer.verifyHash(sig.contentHash, sig.signature)).toBe(true);
  });

  describe('FAIL-SAFE: absent / malformed key ⇒ UNSIGNED, never forged', () => {
    it('a null key yields an unavailable signer whose signHash returns null', () => {
      const signer = createAuditTipSigner({ auditSigningKey: null });
      expect(signer.available).toBe(false);
      expect(signer.publicKey).toBeNull();
      expect(signer.keyId).toBeNull();
      expect(signer.signHash(sampleHash(), 1)).toBeNull();
    });

    it('a wrong-length / malformed base64 key yields an unavailable signer', () => {
      expect(createAuditTipSigner({ auditSigningKey: '' }).available).toBe(false);
      expect(
        createAuditTipSigner({ auditSigningKey: Buffer.alloc(16).toString('base64') }).available,
      ).toBe(false);
      expect(createAuditTipSigner({ auditSigningKey: 'not-base64-!!!' }).available).toBe(false);
    });

    it('an unavailable signer STILL verifies an externally-supplied public key', () => {
      // Real signature from a keyed signer; an unkeyed verifier can still check it
      // as an external verifier (verification needs only the public key).
      const keyed = createAuditTipSigner({ auditSigningKey: seed() });
      const hash = sampleHash();
      const sig = keyed.signHash(hash, 3)!;

      const unkeyed = createAuditTipSigner({ auditSigningKey: null });
      expect(unkeyed.verifyHash(hash, sig.signature, sig.publicKey)).toBe(true);
      // ...but with no key supplied and none held, it cannot verify.
      expect(unkeyed.verifyHash(hash, sig.signature)).toBe(false);
    });
  });
});
