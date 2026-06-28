import { verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { DistributionError } from '../../errors/index';
import type { Result } from '../../result';
import { ok, err } from '../../result';
import {
  effectiveAlgs,
  effectiveSkew,
  type OidcConfig,
  type SsoIdentity,
} from './oidc-config';
import { createJwksClient, type JwksClient } from './jwks';

/**
 * Map a JWS `alg` to a Node verify spec. We only support asymmetric algs:
 *  - RS* → RSASSA-PKCS1-v1_5 over SHA-2 (the key carries the modulus).
 *  - ES* → ECDSA over SHA-2 with IEEE-P1363 (raw r||s) signature encoding.
 *
 * `none` and HS* (HMAC) are intentionally absent: accepting them would let an
 * attacker forge a token with no key or a guessable secret (the classic OIDC
 * alg-confusion attack). An unknown alg returns undefined → the verify denies.
 */
function algToVerifySpec(
  alg: string,
): { hash: string; dsaEncoding?: 'ieee-p1363' } | undefined {
  switch (alg) {
    case 'RS256':
      return { hash: 'sha256' };
    case 'RS384':
      return { hash: 'sha384' };
    case 'RS512':
      return { hash: 'sha512' };
    case 'ES256':
      return { hash: 'sha256', dsaEncoding: 'ieee-p1363' };
    case 'ES384':
      return { hash: 'sha384', dsaEncoding: 'ieee-p1363' };
    case 'ES512':
      return { hash: 'sha512', dsaEncoding: 'ieee-p1363' };
    default:
      return undefined;
  }
}

const JwsHeaderSchema = z.object({
  alg: z.string(),
  kid: z.string().optional(),
  typ: z.string().optional(),
});

const IdTokenClaimsSchema = z
  .object({
    iss: z.string(),
    aud: z.union([z.string(), z.array(z.string())]),
    sub: z.string(),
    exp: z.number(),
    iat: z.number().optional(),
    nbf: z.number().optional(),
    email: z.string().optional(),
    email_verified: z.boolean().optional(),
    name: z.string().optional(),
    azp: z.string().optional(),
  })
  .passthrough();

function decodeSegment(seg: string): unknown {
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
}

function audienceMatches(aud: string | string[], expected: string, azp?: string): boolean {
  const list = Array.isArray(aud) ? aud : [aud];
  if (!list.includes(expected)) return false;
  // RFC: if multiple audiences, azp (authorized party) MUST be our client.
  if (list.length > 1 && azp !== undefined && azp !== expected) return false;
  return true;
}

/**
 * The SSO verification port. `verifyIdToken` returns a verified `SsoIdentity`
 * or a `Result` error — it NEVER throws a verified identity on a bad token, and
 * NEVER returns a partial/unverified identity. Every failure path is a deny.
 */
export interface SsoPort {
  verifyIdToken(idToken: string): Promise<Result<SsoIdentity, DistributionError>>;
}

export interface OidcVerifierOptions {
  readonly config: OidcConfig;
  /** Injected JWKS client (tests); else derived from config + discovery. */
  readonly jwks?: JwksClient;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

/** Resolve the JWKS URI from explicit config or OIDC discovery. */
async function resolveJwksUri(config: OidcConfig, fetchImpl: typeof fetch): Promise<string> {
  if (config.jwksUri) return config.jwksUri;
  const discoveryUrl = new URL(
    '.well-known/openid-configuration',
    config.issuer.endsWith('/') ? config.issuer : `${config.issuer}/`,
  ).toString();
  const res = await fetchImpl(discoveryUrl, { headers: { accept: 'application/json' } });
  if (res.status >= 400) {
    throw new DistributionError('provider_unavailable', `OIDC discovery → ${res.status}`, {
      discoveryUrl,
    });
  }
  const doc = z
    .object({ jwks_uri: z.string().url(), issuer: z.string().optional() })
    .safeParse(await res.json().catch(() => null));
  if (!doc.success) {
    throw new DistributionError('provider_unavailable', 'OIDC discovery had no jwks_uri', {
      discoveryUrl,
    });
  }
  return doc.data.jwks_uri;
}

/**
 * A real, generic OIDC id-token verifier. Steps, in order — any failure denies:
 *  1. structurally split + decode the compact JWS (header.payload.signature);
 *  2. enforce the header `alg` is in the config's allow-list (asymmetric only);
 *  3. fetch the issuer's JWKS (cached) and select the key by `kid`;
 *  4. cryptographically verify the signature over `header.payload`;
 *  5. validate claims: `iss` exactly matches, `aud` contains our audience
 *     (azp-checked when multi-aud), `exp`/`nbf` within clock-skew, `enabled`.
 */
export function createOidcVerifier(opts: OidcVerifierOptions): SsoPort {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const now = opts.now ?? (() => new Date());
  const config = opts.config;
  const algs = new Set(effectiveAlgs(config));
  const skew = effectiveSkew(config);

  let jwksClient = opts.jwks;
  async function jwks(): Promise<JwksClient> {
    if (jwksClient) return jwksClient;
    if (!fetchImpl) {
      throw new DistributionError('provider_unavailable', 'no fetch implementation available');
    }
    const jwksUri = await resolveJwksUri(config, fetchImpl);
    jwksClient = createJwksClient({ jwksUri, fetchImpl });
    return jwksClient;
  }

  return {
    async verifyIdToken(idToken) {
      if (!config.enabled) {
        return err(
          new DistributionError('entitlement_denied', `OIDC SSO is disabled for org '${config.orgId}'`),
        );
      }
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        return err(new DistributionError('invalid_input', 'malformed id_token (not a compact JWS)'));
      }
      const [headerSeg, payloadSeg, sigSeg] = parts as [string, string, string];

      let header: z.infer<typeof JwsHeaderSchema>;
      try {
        header = JwsHeaderSchema.parse(decodeSegment(headerSeg));
      } catch {
        return err(new DistributionError('invalid_input', 'invalid id_token header'));
      }

      if (!algs.has(header.alg)) {
        return err(
          new DistributionError('invalid_input', `id_token alg '${header.alg}' is not allowed`, {
            allowed: [...algs],
          }),
        );
      }
      const spec = algToVerifySpec(header.alg);
      if (!spec) {
        return err(new DistributionError('invalid_input', `unsupported alg '${header.alg}'`));
      }

      // Resolve the verifying key and check the signature BEFORE trusting claims.
      let key: KeyObject;
      try {
        key = await (await jwks()).getKey(header.kid);
      } catch (e) {
        return err(
          e instanceof DistributionError
            ? e
            : new DistributionError('provider_unavailable', 'JWKS resolution failed'),
        );
      }

      const signingInput = Buffer.from(`${headerSeg}.${payloadSeg}`);
      let signature: Buffer;
      try {
        signature = Buffer.from(sigSeg, 'base64url');
      } catch {
        return err(new DistributionError('invalid_input', 'invalid id_token signature encoding'));
      }
      const sigValid = cryptoVerify(
        spec.hash,
        signingInput,
        spec.dsaEncoding ? { key, dsaEncoding: spec.dsaEncoding } : key,
        signature,
      );
      if (!sigValid) {
        return err(new DistributionError('invalid_input', 'id_token signature verification failed'));
      }

      // Signature is valid — now validate the claims.
      let claims: z.infer<typeof IdTokenClaimsSchema>;
      try {
        claims = IdTokenClaimsSchema.parse(decodeSegment(payloadSeg));
      } catch {
        return err(new DistributionError('invalid_input', 'invalid id_token claims'));
      }

      if (claims.iss !== config.issuer) {
        return err(
          new DistributionError('invalid_input', 'id_token issuer mismatch', {
            expected: config.issuer,
          }),
        );
      }
      if (!audienceMatches(claims.aud, config.audience, claims.azp)) {
        return err(
          new DistributionError('invalid_input', 'id_token audience mismatch', {
            expected: config.audience,
          }),
        );
      }

      const nowSec = Math.floor(now().getTime() / 1000);
      if (nowSec >= claims.exp + skew) {
        return err(new DistributionError('invalid_input', 'id_token is expired'));
      }
      if (claims.nbf !== undefined && nowSec + skew < claims.nbf) {
        return err(new DistributionError('invalid_input', 'id_token is not yet valid (nbf)'));
      }

      const identity: SsoIdentity = {
        issuer: claims.iss,
        subject: claims.sub,
        ...(claims.email ? { email: claims.email } : {}),
        ...(claims.email_verified !== undefined ? { emailVerified: claims.email_verified } : {}),
        ...(claims.name ? { name: claims.name } : {}),
        claims,
      };
      return ok(identity);
    },
  };
}
