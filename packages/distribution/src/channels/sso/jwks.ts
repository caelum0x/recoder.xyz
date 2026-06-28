import { createPublicKey, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { DistributionError } from '../../errors/index';

/**
 * A JSON Web Key (the subset we import). Only asymmetric keys (RSA, EC) are
 * accepted — symmetric (`oct`) keys are rejected so an id-token can never be
 * "verified" with a shared secret an attacker could also hold.
 */
const JwkSchema = z.object({
  kty: z.string(),
  kid: z.string().optional(),
  use: z.string().optional(),
  alg: z.string().optional(),
  // RSA
  n: z.string().optional(),
  e: z.string().optional(),
  // EC
  crv: z.string().optional(),
  x: z.string().optional(),
  y: z.string().optional(),
});

export type Jwk = z.infer<typeof JwkSchema>;

const JwksSchema = z.object({ keys: z.array(JwkSchema) });

/**
 * Import a JWK into a Node `KeyObject` public key. Uses the standardized JWK
 * import (`createPublicKey({ key, format: 'jwk' })`), which validates the key
 * material. Throws a `DistributionError` for unsupported/malformed keys — a
 * verify against an unimportable key is a denial, never a pass.
 */
export function importJwk(jwk: Jwk): KeyObject {
  if (jwk.kty !== 'RSA' && jwk.kty !== 'EC') {
    throw new DistributionError('invalid_input', `unsupported JWK kty '${jwk.kty}' (asymmetric only)`);
  }
  try {
    return createPublicKey({ key: jwk as Record<string, unknown>, format: 'jwk' });
  } catch (e) {
    throw new DistributionError(
      'invalid_input',
      `failed to import JWK: ${e instanceof Error ? e.message : 'unknown error'}`,
    );
  }
}

export interface JwksClient {
  /** Resolve a verifying key by `kid`. Refetches once on a cache miss. */
  getKey(kid: string | undefined): Promise<KeyObject>;
}

export interface JwksClientOptions {
  readonly jwksUri: string;
  readonly fetchImpl?: typeof fetch;
  /** Cache TTL in ms (default 5 min). */
  readonly cacheTtlMs?: number;
  readonly now?: () => number;
}

interface CacheEntry {
  readonly keys: Map<string, KeyObject>;
  /** A single-key set (no `kid`) fallback, when the JWKS has exactly one key. */
  readonly soleKey?: KeyObject;
  readonly fetchedAt: number;
}

/**
 * A caching JWKS client. Fetches the issuer's JWKS, imports each key, and caches
 * by `kid` with a TTL. On a `kid` miss it force-refetches once (handling key
 * rotation) before denying. The cache is per-client (per issuer).
 */
export function createJwksClient(opts: JwksClientOptions): JwksClient {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const ttl = opts.cacheTtlMs ?? 5 * 60 * 1000;
  const now = opts.now ?? (() => Date.now());
  let cache: CacheEntry | undefined;

  async function fetchJwks(): Promise<CacheEntry> {
    if (!fetchImpl) {
      throw new DistributionError('provider_unavailable', 'no fetch implementation available for JWKS');
    }
    let res: Response;
    try {
      res = await fetchImpl(opts.jwksUri, { headers: { accept: 'application/json' } });
    } catch (e) {
      throw new DistributionError(
        'provider_unavailable',
        `JWKS fetch failed: ${e instanceof Error ? e.message : 'network error'}`,
        { jwksUri: opts.jwksUri },
      );
    }
    if (res.status >= 400) {
      throw new DistributionError('provider_unavailable', `JWKS endpoint → ${res.status}`, {
        jwksUri: opts.jwksUri,
        status: res.status,
      });
    }
    const parsed = JwksSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success || parsed.data.keys.length === 0) {
      throw new DistributionError('provider_unavailable', 'JWKS response had no usable keys', {
        jwksUri: opts.jwksUri,
      });
    }
    const keys = new Map<string, KeyObject>();
    for (const jwk of parsed.data.keys) {
      try {
        const key = importJwk(jwk);
        if (jwk.kid) keys.set(jwk.kid, key);
      } catch {
        // Skip an individual bad key; others may still verify.
      }
    }
    const entry: CacheEntry = {
      keys,
      ...(parsed.data.keys.length === 1 && parsed.data.keys[0]
        ? { soleKey: importJwk(parsed.data.keys[0]) }
        : {}),
      fetchedAt: now(),
    };
    cache = entry;
    return entry;
  }

  function lookup(entry: CacheEntry, kid: string | undefined): KeyObject | undefined {
    if (kid) return entry.keys.get(kid);
    // No kid in the token header: only safe when the JWKS has exactly one key.
    return entry.soleKey;
  }

  return {
    async getKey(kid) {
      const fresh = cache && now() - cache.fetchedAt < ttl ? cache : await fetchJwks();
      let key = lookup(fresh, kid);
      if (!key) {
        // Possible rotation — force a single refetch before denying.
        key = lookup(await fetchJwks(), kid);
      }
      if (!key) {
        throw new DistributionError('invalid_input', `no JWKS key for kid '${kid ?? '(none)'}'`, {
          jwksUri: opts.jwksUri,
        });
      }
      return key;
    },
  };
}
