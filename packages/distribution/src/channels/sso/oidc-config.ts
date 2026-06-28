import { z } from 'zod';

/**
 * An enterprise org's OIDC SSO configuration. This is the per-org trust anchor:
 * the issuer whose id-tokens we accept, the audience (client id) we require, and
 * where to fetch the issuer's signing keys (JWKS).
 *
 * `jwksUri` is kept explicit (rather than always derived from discovery) so a
 * host can pin it; when absent the verifier resolves it from the issuer's
 * `/.well-known/openid-configuration`. There are NO hardcoded issuers/domains —
 * every value is per-org config.
 */
export interface OidcConfig {
  readonly orgId: string;
  /** The exact `iss` claim we require (and the discovery base). */
  readonly issuer: string;
  /** The `aud` claim we require — the org's OIDC client id. */
  readonly audience: string;
  /** Explicit JWKS endpoint; when absent, resolved via OIDC discovery. */
  readonly jwksUri?: string;
  /** Allowed signing algorithms (deny-list everything else). RS256 default. */
  readonly allowedAlgs?: readonly string[];
  /** Clock-skew tolerance, seconds (default 60). */
  readonly clockSkewSeconds?: number;
  readonly enabled: boolean;
}

export const OidcConfigSchema: z.ZodType<OidcConfig> = z.object({
  orgId: z.string().min(1),
  issuer: z.string().url(),
  audience: z.string().min(1),
  jwksUri: z.string().url().optional(),
  allowedAlgs: z.array(z.string().min(1)).nonempty().optional(),
  clockSkewSeconds: z.number().int().nonnegative().optional(),
  enabled: z.boolean(),
});

/** Algorithms we will verify by default. Asymmetric only — never `none`/HS*. */
export const DEFAULT_OIDC_ALGS: readonly string[] = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384'];

/** Resolve the effective allowed algorithm list for a config. */
export function effectiveAlgs(config: OidcConfig): readonly string[] {
  return config.allowedAlgs && config.allowedAlgs.length > 0
    ? config.allowedAlgs
    : DEFAULT_OIDC_ALGS;
}

/** Resolve the effective clock-skew tolerance in seconds. */
export function effectiveSkew(config: OidcConfig): number {
  return config.clockSkewSeconds ?? 60;
}

/**
 * The verified identity an OIDC id-token projects. This is what SSO hands the
 * platform to bind a session; recoder.xyz remains the identity authority that
 * maps `(issuer, subject)` to a recoder user.
 */
export interface SsoIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly name?: string;
  /** Raw verified claims, for the host to map org-specific attributes. */
  readonly claims: Readonly<Record<string, unknown>>;
}
