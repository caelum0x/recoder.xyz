/**
 * `byok-key-resolver` — verifies BYOK key resolution INTO the delivery path:
 * cache-miss → governance-secrets fetch → cache upsert (so `keyCache.get`
 * finally has a caller), the governed store path (encrypt + metadata upsert +
 * cache invalidation), truthful nulls/failures when the secrets seam is unwired
 * or the vault is down, and the redaction law (no key material in reasons).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { ProviderKeyRepository, KeyVaultPort } from '../ports/provider-keys.port.js';
import type { ByokSecretsPort } from '../ports/byok-resolver.port.js';
import type { SecretsPort } from '../../governance/ports/secrets.port.js';
import { createProviderKeyCache } from './byok-key-cache.js';
import { createByokKeyResolver, byokSecretRef } from './byok-key-resolver.js';

// COMPILE-TIME wiring guarantee: the REAL governance `SecretsPort`
// (`governance.secrets()`) satisfies the resolver's `ByokSecretsPort` seam, so
// the bootstrap injection `secrets: governance.secrets()` can never drift.
const _secretsSeamCompat: ByokSecretsPort = {} as SecretsPort;
void _secretsSeamCompat;

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

const PLAINTEXT = 'sk-live-secret-0123456789';

/** A working fake vault so the REAL TTL cache participates in the round-trip. */
const fakeVault: KeyVaultPort = {
  available: true,
  encrypt: async (s) => `enc:${s}`,
  decrypt: async (s) => s.replace(/^enc:/, ''),
};

function fakeRepo(): ProviderKeyRepository {
  return {
    listForUser: vi.fn(async () => []),
    get: vi.fn(async () => null),
    upsert: vi.fn(async (input: { userId: string; provider: string; vaultRef?: string | null }) => ({
      userId: input.userId,
      provider: input.provider,
      keyVersion: 1,
      vaultRef: input.vaultRef ?? null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      rotatedAt: null,
    })),
    rotate: vi.fn(async () => null),
    markUsed: vi.fn(async () => undefined),
    delete: vi.fn(async () => true),
    isDurable: () => true,
  } as unknown as ProviderKeyRepository;
}

function fakeSecrets(initial: Record<string, string> = {}): ByokSecretsPort & { store: Map<string, string>; getSpy: ReturnType<typeof vi.fn> } {
  const store = new Map<string, string>(Object.entries(initial));
  const getSpy = vi.fn(async (owner: string, ref: string) => store.get(`${owner}:${ref}`) ?? null);
  return {
    store,
    getSpy,
    get: getSpy,
    set: async (owner, ref, plaintext) => {
      store.set(`${owner}:${ref}`, plaintext);
      return { ref, keyVersion: 1 };
    },
    delete: async (owner, ref) => store.delete(`${owner}:${ref}`),
  };
}

describe('byok key resolution (happy path + cache upsert)', () => {
  it('resolves a stored key via secrets and upserts the cache (second hit skips secrets)', async () => {
    const secrets = fakeSecrets({ [`u1:${byokSecretRef('openai')}`]: PLAINTEXT });
    const cache = createProviderKeyCache({ vault: fakeVault });
    const resolver = createByokKeyResolver({ logger: log, cache, repository: fakeRepo(), secrets });

    expect(await resolver.resolve('u1', 'openai')).toBe(PLAINTEXT);
    expect(secrets.getSpy).toHaveBeenCalledTimes(1);

    // Cache upsert wiring: the second resolve is served by the encrypted cache.
    expect(await resolver.resolve('u1', 'openai')).toBe(PLAINTEXT);
    expect(secrets.getSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null for a missing key (truthful miss, never a fabricated key)', async () => {
    const resolver = createByokKeyResolver({
      logger: log,
      cache: createProviderKeyCache({ vault: fakeVault }),
      repository: fakeRepo(),
      secrets: fakeSecrets(),
    });
    expect(await resolver.resolve('u1', 'anthropic')).toBeNull();
  });

  it('returns null when the secrets seam is unwired (disabled resolver)', async () => {
    const resolver = createByokKeyResolver({
      logger: log,
      cache: createProviderKeyCache({ vault: fakeVault }),
      repository: fakeRepo(),
    });
    expect(resolver.enabled()).toBe(false);
    expect(await resolver.resolve('u1', 'openai')).toBeNull();
  });

  it('returns null (never throws) when the secrets get rejects (vault down)', async () => {
    const secrets = fakeSecrets();
    secrets.getSpy.mockRejectedValueOnce(new Error('vault master key absent'));
    const resolver = createByokKeyResolver({
      logger: log,
      cache: createProviderKeyCache({ vault: fakeVault }),
      repository: fakeRepo(),
      secrets,
    });
    expect(await resolver.resolve('u1', 'openai')).toBeNull();
  });
});

describe('byok key store (governed write path)', () => {
  it('encrypt-stores the key, upserts the metadata vaultRef, and invalidates the cache', async () => {
    const secrets = fakeSecrets();
    const repo = fakeRepo();
    const cache = createProviderKeyCache({ vault: fakeVault });
    const resolver = createByokKeyResolver({ logger: log, cache, repository: repo, secrets });

    // Warm the cache with a stale key, then store a new one.
    await cache.set('u1', { openai: 'stale-key' });
    const result = await resolver.store('u1', 'openai', PLAINTEXT);

    expect(result.stored).toBe(true);
    expect(secrets.store.get(`u1:${byokSecretRef('openai')}`)).toBe(PLAINTEXT);
    expect(repo.upsert).toHaveBeenCalledWith({ userId: 'u1', provider: 'openai', vaultRef: byokSecretRef('openai') });
    // Invalidation proven: the next resolve re-fetches the NEW key from secrets.
    expect(await resolver.resolve('u1', 'openai')).toBe(PLAINTEXT);
  });

  it('fails closed with a truthful reason when the secrets seam is unwired', async () => {
    const resolver = createByokKeyResolver({
      logger: log,
      cache: createProviderKeyCache({ vault: fakeVault }),
      repository: fakeRepo(),
    });
    const result = await resolver.store('u1', 'openai', PLAINTEXT);
    expect(result.stored).toBe(false);
    if (!result.stored) expect(result.reason).toContain('secrets seam not wired');
  });

  it('fails closed (no throw) when the secrets set rejects, without leaking the key', async () => {
    const secrets = fakeSecrets();
    secrets.set = async () => {
      throw new Error('vault unavailable');
    };
    const resolver = createByokKeyResolver({
      logger: log,
      cache: createProviderKeyCache({ vault: fakeVault }),
      repository: fakeRepo(),
      secrets,
    });
    const result = await resolver.store('u1', 'openai', PLAINTEXT);
    expect(result.stored).toBe(false);
    if (!result.stored) {
      expect(result.reason).toContain('vault unavailable');
      expect(result.reason).not.toContain(PLAINTEXT); // redaction law
    }
  });
});

describe('byok key remove + markUsed', () => {
  it('removes the secret, the metadata row, and the cached entry', async () => {
    const secrets = fakeSecrets({ [`u1:${byokSecretRef('openai')}`]: PLAINTEXT });
    const repo = fakeRepo();
    const cache = createProviderKeyCache({ vault: fakeVault });
    const resolver = createByokKeyResolver({ logger: log, cache, repository: repo, secrets });

    await resolver.resolve('u1', 'openai'); // warm the cache
    expect(await resolver.remove('u1', 'openai')).toBe(true);
    expect(repo.delete).toHaveBeenCalledWith('u1', 'openai');
    expect(await resolver.resolve('u1', 'openai')).toBeNull(); // secret + cache gone
  });

  it('markUsed never throws even when the repository rejects', async () => {
    const repo = fakeRepo();
    (repo.markUsed as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    const resolver = createByokKeyResolver({
      logger: log,
      cache: createProviderKeyCache({ vault: fakeVault }),
      repository: repo,
      secrets: fakeSecrets(),
    });
    expect(() => resolver.markUsed('u1', 'openai')).not.toThrow();
    await new Promise((r) => setImmediate(r)); // let the rejected promise settle (caught)
  });
});
