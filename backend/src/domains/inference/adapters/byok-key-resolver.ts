/**
 * `createByokKeyResolver` — the concrete BYOK key-resolution seam that finally
 * connects the three previously-orphaned pieces into the delivery path:
 *
 *   governance `SecretsPort` (durable envelope-encrypted ciphertext)
 *     ⇄ `ProviderKeyCache` (short-TTL, AES-at-rest in-memory cache — the
 *        `keyCache.get` that had zero callers)
 *     + `ProviderKeyRepository` (metadata: presence, `vaultRef`, rotation audit)
 *
 * Degrade truth table:
 *  - secrets seam unwired  → `enabled() === false`, `resolve` → null,
 *                            `store` → `{ stored:false }` (fail closed).
 *  - vault master key down → secrets get/set reject → caught → truthful
 *                            null / `{ stored:false, reason }` (never plaintext).
 *  - cache vault down      → cache disables itself; every resolve re-fetches.
 *  - metadata repo down    → resolution still works (secrets is the source of
 *                            truth); the metadata row is best-effort.
 *
 * SECURITY: no plaintext key ever reaches a log line, an error message, or a
 * return value other than `resolve()`'s.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  ProviderKeyCache,
  ProviderKeyRepository,
} from '../ports/provider-keys.port.js';
import type { ByokKeyResolver, ByokSecretsPort, ByokStoreResult } from '../ports/byok-resolver.port.js';

/** The owner-scoped secret ref a provider key is stored under. */
export function byokSecretRef(provider: string): string {
  return `inference/byok/${provider}`;
}

export interface ByokKeyResolverDeps {
  readonly logger: Logger;
  readonly cache: ProviderKeyCache;
  readonly repository: ProviderKeyRepository;
  /** The governance secrets seam. Absent ⇒ resolver disabled (truthfully). */
  readonly secrets?: ByokSecretsPort | undefined;
}

/** Build the BYOK key resolver over the injected cache + secrets + metadata repo. */
export function createByokKeyResolver(deps: ByokKeyResolverDeps): ByokKeyResolver {
  const { logger, cache, repository, secrets } = deps;

  return {
    enabled(): boolean {
      return secrets !== undefined;
    },

    async resolve(ownerId: string, provider: string): Promise<string | null> {
      if (!ownerId || !provider) return null;
      // 1. The encrypted TTL cache (upserted below on a durable hit).
      try {
        const cached = await cache.get(ownerId);
        const hit = cached?.[provider];
        if (typeof hit === 'string' && hit.length > 0) return hit;
      } catch {
        // A cache fault must never block resolution — fall through to durable.
      }
      // 2. The durable governance secret (vault-down rejects → truthful null).
      if (!secrets) return null;
      try {
        const key = await secrets.get(ownerId, byokSecretRef(provider));
        if (!key) return null;
        // 3. Cache upsert (merge — a vault-less cache no-ops internally).
        try {
          const existing = (await cache.get(ownerId)) ?? {};
          await cache.set(ownerId, { ...existing, [provider]: key });
        } catch {
          // Caching is an optimization; a failure never blocks delivery.
        }
        return key;
      } catch (err) {
        logger.debug(
          { provider, ownerId, err: message(err) },
          'byok secret resolution failed — declining truthfully (no key material logged)',
        );
        return null;
      }
    },

    async store(ownerId: string, provider: string, plaintextKey: string): Promise<ByokStoreResult> {
      if (!secrets) {
        return {
          stored: false,
          reason: 'governance secrets seam not wired — BYOK key writes are disabled',
        };
      }
      const ref = byokSecretRef(provider);
      try {
        await secrets.set(ownerId, ref, plaintextKey);
      } catch (err) {
        // The secrets service rejects fail-safe (e.g. vault master key absent).
        // Its messages are user-safe and never contain the plaintext.
        return { stored: false, reason: `BYOK key store failed: ${message(err)}` };
      }
      // Metadata row is best-effort audit surface (null when the repo is down).
      const record = await repository.upsert({ userId: ownerId, provider, vaultRef: ref });
      cache.invalidate(ownerId);
      logger.info({ provider, ownerId }, 'byok provider key stored (governed; material never logged)');
      return { stored: true, record, ref };
    },

    async remove(ownerId: string, provider: string): Promise<boolean> {
      let removedSecret = false;
      if (secrets) {
        try {
          removedSecret = await secrets.delete(ownerId, byokSecretRef(provider));
        } catch (err) {
          logger.warn({ provider, ownerId, err: message(err) }, 'byok secret delete failed');
        }
      }
      const removedMeta = await repository.delete(ownerId, provider);
      cache.invalidate(ownerId);
      return removedSecret || removedMeta;
    },

    markUsed(ownerId: string, provider: string): void {
      void repository.markUsed(ownerId, provider).catch(() => {
        // Best-effort audit stamp — never surfaces.
      });
    },
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
