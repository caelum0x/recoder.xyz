/**
 * `byok-key-cache.ts` — the encrypted, TTL-bounded per-user BYOK key cache.
 *
 * PORTED from `backend/src/engines/byok-key-cache.ts` (whose `./vault` +
 * `./public-api/byok-provider-keys` imports were removed in the src refactor, so
 * it no longer compiles). The design is preserved verbatim — AES-256-GCM at rest
 * via a vault, 5-minute TTL, caching disabled when no master key — but decoupled
 * behind an injectable {@link KeyVaultPort} so it compiles and unit-tests without
 * the legacy vault singleton.
 *
 * SECURITY: keys are only ever held encrypted at rest; when the vault is
 * unavailable (no master key) caching is disabled entirely — every read misses
 * and the caller re-fetches, never a plaintext cache.
 */
import type { AIProviderKeys, KeyVaultPort, ProviderKeyCache } from '../ports/provider-keys.port.js';

/** TTL for a cached key set (mirrors the ported original: 5 minutes). */
export const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  readonly encrypted: string;
  readonly expiresAt: number;
}

export interface KeyCacheOptions {
  readonly vault: KeyVaultPort;
  /** Injectable clock (defaults to `Date.now`) — for deterministic TTL tests. */
  readonly now?: () => number;
  /** Override the TTL (ms). */
  readonly ttlMs?: number;
}

/**
 * Build the encrypted TTL key cache over an injected vault. When the vault is
 * unavailable, `get` always misses and `set` is a no-op (no plaintext cache).
 */
export function createProviderKeyCache(options: KeyCacheOptions): ProviderKeyCache {
  const { vault } = options;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const cache = new Map<string, CacheEntry>();

  return {
    async get(userId: string): Promise<AIProviderKeys | null> {
      if (!vault.available) return null;
      const entry = cache.get(userId);
      if (!entry) return null;
      if (now() > entry.expiresAt) {
        cache.delete(userId);
        return null;
      }
      try {
        const parsed = JSON.parse(await vault.decrypt(entry.encrypted));
        return parsed && typeof parsed === 'object' ? (parsed as AIProviderKeys) : null;
      } catch {
        // Tamper / bad ciphertext / vault error → drop the entry, force a re-fetch.
        cache.delete(userId);
        return null;
      }
    },

    async set(userId: string, keys: AIProviderKeys): Promise<void> {
      if (!vault.available) return;
      try {
        cache.set(userId, {
          encrypted: await vault.encrypt(JSON.stringify(keys)),
          expiresAt: now() + ttlMs,
        });
      } catch {
        // A vault failure must never persist plaintext — just skip caching.
        cache.delete(userId);
      }
    },

    invalidate(userId: string): void {
      cache.delete(userId);
    },

    clear(): void {
      cache.clear();
    },
  };
}
