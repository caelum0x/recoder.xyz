import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  createVaultKeyring,
  keyringFromMasterKey,
  type KeyringRow,
} from '../adapters/keyring.adapter.js';
import { createVaultAdapter } from '../adapters/vault.adapter.js';

/** A fresh, valid 32-byte AES-256 master key, base64-encoded. */
function validKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

describe('createVaultKeyring — versioned master-key rotation over the vault seam', () => {
  describe('active-version seal + version metadata', () => {
    it('defaults activeVersion to the highest supplied version and lists versions ascending', () => {
      const ring = createVaultKeyring({
        keys: [
          { version: 2, masterKey: validKey() },
          { version: 1, masterKey: validKey() },
          { version: 3, masterKey: validKey() },
        ],
      });
      expect(ring.available).toBe(true);
      expect(ring.activeVersion).toBe(3);
      expect(ring.versions).toEqual([1, 2, 3]);
      expect(ring.status()).toEqual({ name: 'vault', status: 'up' });
    });

    it('seals under the ACTIVE version and stamps that version on the row', async () => {
      const ring = createVaultKeyring({
        keys: [
          { version: 1, masterKey: validKey() },
          { version: 2, masterKey: validKey() },
        ],
      });
      const sealed = await ring.seal('active-version-secret');
      expect(sealed.keyVersion).toBe(2);
      // Real encryption occurred (never the plaintext bytes).
      expect(sealed.ciphertext.toString('utf8')).not.toBe('active-version-secret');
      expect(await ring.open(sealed)).toBe('active-version-secret');
    });

    it('honours an explicit activeVersion override', async () => {
      const ring = createVaultKeyring({
        keys: [
          { version: 1, masterKey: validKey() },
          { version: 2, masterKey: validKey() },
        ],
        activeVersion: 1,
      });
      expect(ring.activeVersion).toBe(1);
      const sealed = await ring.seal('pinned-to-v1');
      expect(sealed.keyVersion).toBe(1);
    });
  });

  describe('BACKWARD COMPATIBLE: open a row by ITS OWN version', () => {
    it('opens a v1 row after v2 becomes the active version', async () => {
      const v1Key = validKey();
      const v2Key = validKey();

      // A v1 row produced before v2 existed (single-key adapter == the ring v1 key).
      const legacyAdapter = createVaultAdapter({ vaultMasterKey: v1Key, keyVersion: 1 });
      const legacySealed = await legacyAdapter.seal('legacy-v1-value');
      const v1Row: KeyringRow = {
        ciphertext: legacySealed.ciphertext,
        nonce: legacySealed.nonce,
        keyVersion: 1,
      };

      // Now the ring carries both keys with v2 active.
      const ring = createVaultKeyring({
        keys: [
          { version: 1, masterKey: v1Key },
          { version: 2, masterKey: v2Key },
        ],
      });
      expect(ring.activeVersion).toBe(2);
      // The old v1 row still opens — routed to the v1 key, not the active v2 key.
      expect(await ring.open(v1Row)).toBe('legacy-v1-value');
    });

    it('opens both a v1-sealed and a v2-sealed row under the same ring', async () => {
      const v1Key = validKey();
      const v2Key = validKey();

      const v1Adapter = createVaultAdapter({ vaultMasterKey: v1Key, keyVersion: 1 });
      const v2Adapter = createVaultAdapter({ vaultMasterKey: v2Key, keyVersion: 2 });
      const v1Sealed = await v1Adapter.seal('row-from-v1');
      const v2Sealed = await v2Adapter.seal('row-from-v2');

      const ring = createVaultKeyring({
        keys: [
          { version: 1, masterKey: v1Key },
          { version: 2, masterKey: v2Key },
        ],
      });

      expect(await ring.open({ ...v1Sealed, keyVersion: 1 })).toBe('row-from-v1');
      expect(await ring.open({ ...v2Sealed, keyVersion: 2 })).toBe('row-from-v2');
    });
  });

  describe('RE-KEY: v(n) row → re-sealed under active v(n+1)', () => {
    it('re-keys a v1 row onto the active v2 key: distinct ciphertext, version bumped, opens back', async () => {
      const v1Key = validKey();
      const v2Key = validKey();

      // Seal a value at v1 (v1-only adapter).
      const v1Adapter = createVaultAdapter({ vaultMasterKey: v1Key, keyVersion: 1 });
      const v1Sealed = await v1Adapter.seal('rotate-me');
      const v1Row: KeyringRow = {
        ciphertext: v1Sealed.ciphertext,
        nonce: v1Sealed.nonce,
        keyVersion: 1,
      };

      const ring = createVaultKeyring({
        keys: [
          { version: 1, masterKey: v1Key },
          { version: 2, masterKey: v2Key },
        ],
      });

      const rekeyed = await ring.rekey(v1Row);
      // Now stamped at the active version...
      expect(rekeyed.keyVersion).toBe(2);
      // ...with genuinely different bytes (re-sealed under a different key + fresh nonce)...
      expect(rekeyed.ciphertext.equals(v1Row.ciphertext)).toBe(false);
      expect(rekeyed.nonce.equals(v1Row.nonce)).toBe(false);
      // ...and it opens back to the original plaintext under the ring.
      expect(await ring.open(rekeyed)).toBe('rotate-me');

      // The re-keyed bytes do NOT open under the OLD v1 key (real re-wrap, not a copy).
      const v1OnlyRing = keyringFromMasterKey(v1Key, 1);
      await expect(
        v1OnlyRing.open({ ciphertext: rekeyed.ciphertext, nonce: rekeyed.nonce, keyVersion: 1 }),
      ).rejects.toThrow();
    });

    it('re-keying at the active version still produces a fresh nonce/ciphertext (no-op re-wrap)', async () => {
      const ring = createVaultKeyring({ keys: [{ version: 1, masterKey: validKey() }] });
      const sealed = await ring.seal('same-version-rewrap');
      const rekeyed = await ring.rekey(sealed);
      expect(rekeyed.keyVersion).toBe(1);
      expect(rekeyed.nonce.equals(sealed.nonce)).toBe(false);
      expect(rekeyed.ciphertext.equals(sealed.ciphertext)).toBe(false);
      expect(await ring.open(rekeyed)).toBe('same-version-rewrap');
    });
  });

  describe('FAIL-SAFE: absent / invalid active key', () => {
    it('reports available=false / status down when the active key is null', () => {
      const ring = createVaultKeyring({ keys: [{ version: 1, masterKey: null }] });
      expect(ring.available).toBe(false);
      const status = ring.status();
      expect(status.name).toBe('vault');
      expect(status.status).toBe('down');
      expect((status.reason ?? '').length).toBeGreaterThan(0);
    });

    it('reports down when NO keys are supplied (activeVersion defaults to 1)', () => {
      const ring = createVaultKeyring({ keys: [] });
      expect(ring.available).toBe(false);
      expect(ring.activeVersion).toBe(1);
      expect(ring.versions).toEqual([]);
      expect(ring.status().status).toBe('down');
    });

    it('reports down when the activeVersion has no key in the ring', () => {
      const ring = createVaultKeyring({
        keys: [{ version: 1, masterKey: validKey() }],
        activeVersion: 2,
      });
      expect(ring.available).toBe(false);
      expect(ring.status().status).toBe('down');
    });

    it('seal() and rekey() REJECT on a down active key — never a plaintext store', async () => {
      const ring = createVaultKeyring({ keys: [{ version: 1, masterKey: null }] });
      await expect(ring.seal('nope')).rejects.toThrow();
      await expect(
        ring.rekey({ ciphertext: crypto.randomBytes(32), nonce: crypto.randomBytes(12), keyVersion: 1 }),
      ).rejects.toThrow();
    });

    it('can still SEAL under a valid active key even while an OLD version key is down', async () => {
      const ring = createVaultKeyring({
        keys: [
          { version: 1, masterKey: null }, // old key rotated out / lost
          { version: 2, masterKey: validKey() },
        ],
      });
      expect(ring.available).toBe(true);
      const sealed = await ring.seal('new-writes-still-work');
      expect(sealed.keyVersion).toBe(2);
      expect(await ring.open(sealed)).toBe('new-writes-still-work');

      // But opening a v1 row whose key is down still fails (fail-safe, no guess).
      await expect(
        ring.open({ ciphertext: crypto.randomBytes(32), nonce: crypto.randomBytes(12), keyVersion: 1 }),
      ).rejects.toThrow();
    });
  });

  describe('NO GUESSING: unknown row version is refused', () => {
    it('open() throws for a row whose version is absent from the ring', async () => {
      const ring = createVaultKeyring({ keys: [{ version: 1, masterKey: validKey() }] });
      await expect(
        ring.open({ ciphertext: crypto.randomBytes(32), nonce: crypto.randomBytes(12), keyVersion: 9 }),
      ).rejects.toThrow(/no master key for row version 9/);
    });

    it('a row sealed under v2 does NOT open by mis-routing to v1 (auth-tag rejects)', async () => {
      const ring = createVaultKeyring({
        keys: [
          { version: 1, masterKey: validKey() },
          { version: 2, masterKey: validKey() },
        ],
      });
      const sealed = await ring.seal('v2-only'); // active v2
      // Forge a row that claims v1 while carrying v2 bytes — must reject, never decrypt.
      await expect(
        ring.open({ ciphertext: sealed.ciphertext, nonce: sealed.nonce, keyVersion: 1 }),
      ).rejects.toThrow();
    });
  });

  describe('construction guards', () => {
    it('throws on duplicate key versions (silent shadowing is a config error)', () => {
      expect(() =>
        createVaultKeyring({
          keys: [
            { version: 1, masterKey: validKey() },
            { version: 1, masterKey: validKey() },
          ],
        }),
      ).toThrow(/duplicate key version 1/);
    });
  });

  describe('keyringFromMasterKey — single-key backward-compat bridge', () => {
    it('wraps one key at version 1 and round-trips', async () => {
      const ring = keyringFromMasterKey(validKey());
      expect(ring.activeVersion).toBe(1);
      expect(ring.versions).toEqual([1]);
      const sealed = await ring.seal('bridge-value');
      expect(sealed.keyVersion).toBe(1);
      expect(await ring.open(sealed)).toBe('bridge-value');
    });

    it('is down when the single key is null', () => {
      const ring = keyringFromMasterKey(null);
      expect(ring.available).toBe(false);
      expect(ring.status().status).toBe('down');
    });
  });
});
