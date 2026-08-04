/**
 * Apple "Sign in with Apple" client-secret helper.
 *
 * Unlike GitHub/Google, Apple's OAuth client secret is not a static string —
 * it is a short-lived ES256-signed JWT the server mints from the developer's
 * private key (.p8). See:
 *   https://www.better-auth.com/docs/authentication/apple
 *   https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
 *
 * This module is intentionally PURE: it takes the signing material as
 * arguments (never reads process.env) so it is trivially unit-testable with an
 * ephemeral key and reusable by both auth configs and any boot/rotation script.
 */

import { SignJWT, importPKCS8 } from "jose";

/** Apple's fixed issuer/audience for the client-secret JWT. */
export const APPLE_ISSUER_URL = "https://appleid.apple.com";

/**
 * Apple rejects client secrets that live longer than 6 months. We cap at 180
 * days, comfortably under that ceiling, so a freshly minted secret is always
 * accepted.
 */
export const APPLE_CLIENT_SECRET_MAX_TTL_SECONDS = 180 * 24 * 60 * 60;

export interface GenerateAppleClientSecretParams {
  /** Apple Service ID — becomes the JWT `sub` and the OAuth client id. */
  clientId: string;
  /** Apple Developer Team ID — becomes the JWT `iss`. */
  teamId: string;
  /** Key ID of the .p8 private key — becomes the JWT header `kid`. */
  keyId: string;
  /** PKCS#8 PEM contents of the Apple .p8 private key. */
  privateKey: string;
  /** Optional lifetime override; clamped to the Apple 6-month ceiling. */
  expiresInSeconds?: number;
  /** Injectable clock (seconds since epoch) for deterministic tests. */
  now?: number;
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `generateAppleClientSecret: "${field}" is required to mint the Apple client secret.`
    );
  }
  return value;
}

/**
 * Mint an Apple client-secret JWT (ES256) from the developer's signing parts.
 *
 * Header: `{ alg: "ES256", kid: keyId }`. Claims: `iss=teamId`, `sub=clientId`,
 * `aud=https://appleid.apple.com`, `iat=now`, `exp=now+ttl` (ttl <= 180 days).
 */
export async function generateAppleClientSecret(
  params: GenerateAppleClientSecretParams
): Promise<string> {
  const clientId = requireNonEmpty(params.clientId, "clientId");
  const teamId = requireNonEmpty(params.teamId, "teamId");
  const keyId = requireNonEmpty(params.keyId, "keyId");
  const privateKey = requireNonEmpty(params.privateKey, "privateKey");

  const nowSeconds = Math.floor(params.now ?? Date.now() / 1000);
  const requestedTtl =
    params.expiresInSeconds ?? APPLE_CLIENT_SECRET_MAX_TTL_SECONDS;
  // Clamp: never below 1s, never above Apple's ceiling.
  const ttl = Math.min(
    Math.max(1, Math.floor(requestedTtl)),
    APPLE_CLIENT_SECRET_MAX_TTL_SECONDS
  );

  const key = await importPKCS8(privateKey, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER_URL)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttl)
    .sign(key);
}

export interface AppleSecretParts {
  /** Pre-minted client secret JWT (takes precedence when present). */
  clientSecret?: string;
  clientId?: string;
  teamId?: string;
  keyId?: string;
  privateKey?: string;
  expiresInSeconds?: number;
  now?: number;
}

/** True when all four .p8 signing parts are present to derive a secret. */
export function hasAppleSecretParts(parts: AppleSecretParts): boolean {
  return Boolean(
    parts.clientId && parts.teamId && parts.keyId && parts.privateKey
  );
}

/**
 * Resolve the effective Apple client secret: use a directly supplied secret if
 * present, otherwise derive one from the .p8 parts. Returns `undefined` when
 * neither is available (so callers omit the provider rather than fake it).
 */
export async function resolveAppleClientSecret(
  parts: AppleSecretParts
): Promise<string | undefined> {
  if (parts.clientSecret && parts.clientSecret.trim().length > 0) {
    return parts.clientSecret;
  }
  if (hasAppleSecretParts(parts)) {
    return generateAppleClientSecret({
      clientId: parts.clientId!,
      teamId: parts.teamId!,
      keyId: parts.keyId!,
      privateKey: parts.privateKey!,
      expiresInSeconds: parts.expiresInSeconds,
      now: parts.now,
    });
  }
  return undefined;
}
