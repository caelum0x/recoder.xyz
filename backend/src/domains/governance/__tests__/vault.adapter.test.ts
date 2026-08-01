import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createVaultAdapter } from '../adapters/vault.adapter.js';

/** A fresh, valid 32-byte AES-256 master key, base64-encoded. */
function validKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

describe('createVaultAdapter — real AES-256-GCM envelope seam (fail-closed / never plaintext)', () => {
  describe('FAIL-SAFE: absent master key', () => {
    it('reports available=false and status down (never up) when the key is null', () => {
      const vault = createVaultAdapter({ vaultMasterKey: null });
      expect(vault.available).toBe(false);
      const status = vault.status();
      expect(status.name).toBe('vault');
      expect(status.status).toBe('down');
      expect(status.status).not.toBe('up');
      expect(typeof status.reason).toBe('string');
      expect((status.reason ?? '').length).toBeGreaterThan(0);
    });

    it('seal() REJECTS on a null-key adapter — no silent plaintext store path', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: null });
      await expect(vault.seal('super-secret')).rejects.toThrow();
      // Prove it never resolved to a sealed envelope of any shape.
      const outcome = await vault.seal('super-secret').then(
        (v) => ({ resolved: true as const, v }),
        () => ({ resolved: false as const, v: undefined }),
      );
      expect(outcome.resolved).toBe(false);
      expect(outcome.v).toBeUndefined();
    });

    it('open() REJECTS on a null-key adapter — no plaintext-return fallback', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: null });
      const buf = crypto.randomBytes(16);
      await expect(vault.open(buf, buf)).rejects.toThrow();
    });
  });

  describe('FAIL-SAFE: malformed master key', () => {
    it('a <32-byte base64 key yields available=false / status down (no working cipher)', () => {
      const shortKey = crypto.randomBytes(16).toString('base64'); // 16 bytes, too short
      const vault = createVaultAdapter({ vaultMasterKey: shortKey });
      expect(vault.available).toBe(false);
      expect(vault.status().status).toBe('down');
    });

    it('non-base64 garbage / empty string yields available=false / status down', () => {
      const vaultGarbage = createVaultAdapter({ vaultMasterKey: 'not-a-real-key' });
      expect(vaultGarbage.available).toBe(false);
      expect(vaultGarbage.status().status).toBe('down');

      const vaultEmpty = createVaultAdapter({ vaultMasterKey: '' });
      expect(vaultEmpty.available).toBe(false);
      expect(vaultEmpty.status().status).toBe('down');
    });

    it('a malformed-key adapter still rejects seal/open (never a working cipher)', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: 'xx' });
      await expect(vault.seal('x')).rejects.toThrow();
      await expect(vault.open(crypto.randomBytes(16), crypto.randomBytes(12))).rejects.toThrow();
    });
  });

  describe('HAPPY: valid 32-byte key', () => {
    it('reports available=true and status up', () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      expect(vault.available).toBe(true);
      expect(vault.status()).toEqual({ name: 'vault', status: 'up' });
    });
  });

  describe('CRYPTO round-trip', () => {
    it('open(seal(plaintext)) returns the exact original ascii plaintext', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      const plaintext = 'sk-live-0123456789-secret-value';
      const sealed = await vault.seal(plaintext);
      const opened = await vault.open(sealed.ciphertext, sealed.nonce);
      expect(opened).toBe(plaintext);
    });

    it('round-trips a unicode / multi-byte string exactly', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      const plaintext = 'héllo · 世界 · 🔐 · Ω≈ç√∫';
      const sealed = await vault.seal(plaintext);
      const opened = await vault.open(sealed.ciphertext, sealed.nonce);
      expect(opened).toBe(plaintext);
    });

    it('a sealed value is never the plaintext bytes (real encryption occurred)', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      const plaintext = 'plaintext-should-not-appear';
      const sealed = await vault.seal(plaintext);
      expect(sealed.ciphertext.toString('utf8')).not.toBe(plaintext);
      expect(sealed.ciphertext.includes(Buffer.from(plaintext, 'utf8'))).toBe(false);
    });
  });

  describe('NONCE / ciphertext wire shape', () => {
    it('nonce is a 12-byte Buffer and ciphertext carries the 16-byte GCM auth tag', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      const plaintext = 'twelve-byte-nonce-check';
      const plaintextBytes = Buffer.byteLength(plaintext, 'utf8');
      const sealed = await vault.seal(plaintext);

      expect(Buffer.isBuffer(sealed.nonce)).toBe(true);
      expect(sealed.nonce.length).toBe(12);

      expect(Buffer.isBuffer(sealed.ciphertext)).toBe(true);
      // GCM: ciphertext == plaintext-length bytes + 16-byte auth tag.
      expect(sealed.ciphertext.length).toBe(plaintextBytes + 16);
      expect(sealed.ciphertext.length).toBeGreaterThan(plaintextBytes);
    });
  });

  describe('NON-DETERMINISM: fresh IV per seal', () => {
    it('sealing the same plaintext twice yields different nonce and ciphertext, both opening back', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      const plaintext = 'same-input-every-time';

      const a = await vault.seal(plaintext);
      const b = await vault.seal(plaintext);

      expect(a.nonce.equals(b.nonce)).toBe(false);
      expect(a.ciphertext.equals(b.ciphertext)).toBe(false);

      expect(await vault.open(a.ciphertext, a.nonce)).toBe(plaintext);
      expect(await vault.open(b.ciphertext, b.nonce)).toBe(plaintext);
    });
  });

  describe('TAMPER: GCM auth-tag integrity', () => {
    it('open() REJECTS when a ciphertext byte is flipped (no corrupted plaintext returned)', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      const sealed = await vault.seal('integrity-protected-value');

      const tampered = Buffer.from(sealed.ciphertext);
      tampered[0] = tampered[0] ^ 0xff;

      await expect(vault.open(tampered, sealed.nonce)).rejects.toThrow();
    });

    it('open() REJECTS when a nonce byte is flipped', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      const sealed = await vault.seal('integrity-protected-value');

      const tamperedNonce = Buffer.from(sealed.nonce);
      tamperedNonce[0] = tamperedNonce[0] ^  0xff;

      await expect(vault.open(sealed.ciphertext, tamperedNonce)).rejects.toThrow();
    });
  });

  describe('keyVersion propagation', () => {
    it('propagates an explicit keyVersion', () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey(), keyVersion: 5 });
      expect(vault.keyVersion).toBe(5);
    });

    it('defaults keyVersion to 1 when omitted', () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      expect(vault.keyVersion).toBe(1);
    });

    it('still stamps keyVersion even on a down (null-key) adapter', () => {
      const vault = createVaultAdapter({ vaultMasterKey: null, keyVersion: 7 });
      expect(vault.keyVersion).toBe(7);
      expect(vault.available).toBe(false);
    });
  });

  describe('WIRE-FORMAT guard: no guessing / partial decode', () => {
    it('a value sealed by one adapter opens under another adapter built from the SAME key', async () => {
      const key = validKey();
      const sealer = createVaultAdapter({ vaultMasterKey: key });
      const opener = createVaultAdapter({ vaultMasterKey: key });

      const sealed = await sealer.seal('cross-adapter-secret');
      expect(await opener.open(sealed.ciphertext, sealed.nonce)).toBe('cross-adapter-secret');
    });

    it('a value sealed under one key does NOT open under a different key', async () => {
      const sealer = createVaultAdapter({ vaultMasterKey: validKey() });
      const wrongKeyOpener = createVaultAdapter({ vaultMasterKey: validKey() });

      const sealed = await sealer.seal('key-A-secret');
      await expect(wrongKeyOpener.open(sealed.ciphertext, sealed.nonce)).rejects.toThrow();
    });

    it('open() REJECTS random buffers that were not produced by a v1 seal (no partial decode)', async () => {
      const vault = createVaultAdapter({ vaultMasterKey: validKey() });
      const randomCiphertext = crypto.randomBytes(48);
      const randomNonce = crypto.randomBytes(12);
      await expect(vault.open(randomCiphertext, randomNonce)).rejects.toThrow();
    });
  });
});
