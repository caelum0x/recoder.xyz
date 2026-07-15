/**
 * `byok-key-cache` — the ported encrypted TTL cache. Verifies: keys round-trip
 * only through the vault (encrypted at rest), TTL expiry, a disabled cache when
 * the vault is unavailable (never plaintext), and tamper/decrypt-failure eviction.
 */
import { describe, it, expect } from 'vitest';
import { createProviderKeyCache } from './byok-key-cache.js';
import type { KeyVaultPort } from '../ports/provider-keys.port.js';

/** A trivial reversible "vault" (base64) — proves keys never sit in plaintext maps. */
function fakeVault(available = true): KeyVaultPort & { encryptCalls: number } {
  const state = { encryptCalls: 0 };
  return {
    available,
    encryptCalls: 0,
    async encrypt(plaintext: string): Promise<string> {
      state.encryptCalls += 1;
      this.encryptCalls = state.encryptCalls;
      return Buffer.from(plaintext, 'utf8').toString('base64');
    },
    async decrypt(ciphertext: string): Promise<string> {
      return Buffer.from(ciphertext, 'base64').toString('utf8');
    },
  };
}

describe('createProviderKeyCache', () => {
  it('round-trips keys through the vault (encrypted at rest)', async () => {
    const vault = fakeVault();
    const cache = createProviderKeyCache({ vault });
    await cache.set('u1', { openai: 'sk-live' });
    expect(vault.encryptCalls).toBe(1);
    expect(await cache.get('u1')).toEqual({ openai: 'sk-live' });
  });

  it('expires entries after the TTL', async () => {
    let clock = 1000;
    const cache = createProviderKeyCache({ vault: fakeVault(), now: () => clock, ttlMs: 500 });
    await cache.set('u1', { openai: 'sk-live' });
    clock = 1400;
    expect(await cache.get('u1')).toEqual({ openai: 'sk-live' });
    clock = 1600; // past TTL
    expect(await cache.get('u1')).toBeNull();
  });

  it('is disabled when the vault is unavailable (no plaintext cache)', async () => {
    const cache = createProviderKeyCache({ vault: fakeVault(false) });
    await cache.set('u1', { openai: 'sk-live' });
    expect(await cache.get('u1')).toBeNull();
  });

  it('evicts on decrypt failure', async () => {
    const vault = fakeVault();
    const cache = createProviderKeyCache({ vault });
    await cache.set('u1', { openai: 'sk-live' });
    // Corrupt the vault so decrypt throws.
    vault.decrypt = async () => {
      throw new Error('tamper');
    };
    expect(await cache.get('u1')).toBeNull();
    // Restore + confirm the entry was evicted (miss even with a working vault).
    vault.decrypt = async (c: string) => Buffer.from(c, 'base64').toString('utf8');
    expect(await cache.get('u1')).toBeNull();
  });

  it('invalidate + clear drop entries', async () => {
    const cache = createProviderKeyCache({ vault: fakeVault() });
    await cache.set('u1', { openai: 'a' });
    await cache.set('u2', { openai: 'b' });
    cache.invalidate('u1');
    expect(await cache.get('u1')).toBeNull();
    expect(await cache.get('u2')).toEqual({ openai: 'b' });
    cache.clear();
    expect(await cache.get('u2')).toBeNull();
  });
});
