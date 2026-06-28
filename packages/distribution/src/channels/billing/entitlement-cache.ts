import type { Entitlement, Subject } from '../../domain/entitlement';

interface CacheEntry {
  readonly value: Entitlement[];
  readonly expiresAtMs: number;
}

/**
 * A short-TTL entitlement cache. Two fail-safe properties:
 *  - a cache MISS resolves through to the loader (it never assumes a grant);
 *  - the loader itself denies on error (returns []), so a stale-but-empty cache
 *    is the safe state, never a stale allow.
 *
 * The cache only ever holds the loader's actual answer — it never fabricates
 * entitlements.
 */
export interface EntitlementCache {
  get(subject: Subject, loader: (s: Subject) => Promise<Entitlement[]>): Promise<Entitlement[]>;
  invalidate(subjectId: string): void;
  clear(): void;
}

export function createEntitlementCache(opts: {
  ttlMs?: number;
  now?: () => number;
}): EntitlementCache {
  const ttlMs = opts.ttlMs ?? 30_000;
  const now = opts.now ?? (() => Date.now());
  const store = new Map<string, CacheEntry>();

  return {
    async get(subject, loader) {
      const key = `${subject.kind}:${subject.subjectId}`;
      const hit = store.get(key);
      if (hit && hit.expiresAtMs > now()) {
        return hit.value;
      }
      const value = await loader(subject);
      store.set(key, { value, expiresAtMs: now() + ttlMs });
      return value;
    },
    invalidate(subjectId) {
      for (const key of [...store.keys()]) {
        if (key.endsWith(`:${subjectId}`)) store.delete(key);
      }
    },
    clear() {
      store.clear();
    },
  };
}
