/**
 * Apple "Sign in with Apple" helper for the main app auth config.
 *
 * The heavy lifting (minting the ES256 client-secret JWT) lives in the shared
 * `@recoder/auth` package so both auth configs share one implementation. This
 * module adds the app-surface glue: reading env, coercing Apple's string-typed
 * `email_verified`, and the `mapProfileToUser` that persists the email Apple
 * only ever sends on the FIRST authorization.
 */

import { resolveAppleClientSecret } from "@recoder/auth";

export { resolveAppleClientSecret };

/**
 * Apple sends `email_verified` (and `is_private_email`) as either a real
 * boolean or the STRING "true"/"false". Coerce truthfully — never treat the
 * non-empty string "false" as truthy.
 */
export function coerceAppleEmailVerified(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

/** Structural subset of Apple's id-token profile we read in the mapper. */
export interface AppleProfileSubset {
  email?: string | null;
  email_verified?: unknown;
  name?: string | null;
}

/**
 * Map Apple's profile onto our user fields.
 *
 * Apple only returns the email on the FIRST sign-in, so persisting it here (as
 * GitHub's mapper does) makes the address stick to the account. Subsequent
 * sign-ins omit email; we then leave the stored value untouched by returning a
 * partial without the `email` key.
 */
export function appleMapProfileToUser(
  profile: AppleProfileSubset
): { email?: string; emailVerified?: boolean; name?: string } {
  const mapped: { email?: string; emailVerified?: boolean; name?: string } = {};
  if (profile.email) mapped.email = profile.email;
  if (profile.email_verified !== undefined) {
    mapped.emailVerified = coerceAppleEmailVerified(profile.email_verified);
  }
  if (profile.name) mapped.name = profile.name;
  return mapped;
}
