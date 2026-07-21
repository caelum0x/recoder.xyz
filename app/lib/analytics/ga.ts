/**
 * Google Analytics 4 configuration resolution.
 *
 * The GA4 measurement id was previously hardcoded in the root layout. It now
 * resolves from `NEXT_PUBLIC_GA_ID`, falling back to the current production id
 * so nothing breaks when the env var is unset. The owner can rotate the id in
 * env without a code change.
 *
 * NOTE: Cloudflare Web Analytics already covers privacy-first pageviews at the
 * edge (injected by the CF proxy, not from this source). This GA4 layer exists
 * for the typed conversion-event taxonomy in `./events.ts` — do NOT add a
 * second pageview beacon here.
 */

/** Current production GA4 measurement id — used as the fallback. */
export const DEFAULT_GA_MEASUREMENT_ID = 'G-V0G79DP41C';

/**
 * Resolve the GA4 measurement id from `NEXT_PUBLIC_GA_ID`, falling back to the
 * current production id so behavior is preserved when the env var is unset.
 */
export function resolveGaMeasurementId(): string {
  const fromEnv = process.env.NEXT_PUBLIC_GA_ID?.trim();
  return fromEnv ? fromEnv : DEFAULT_GA_MEASUREMENT_ID;
}

/** Search-engine site-ownership verification tokens (all owner-provided via env). */
export interface SiteVerification {
  google?: string;
  other?: Record<string, string>;
}

/**
 * Resolve site-ownership verification tokens from env. Empty/unset tokens are
 * omitted entirely (no empty `<meta>` tags) so the owner can paste a real token
 * later without a code change. Returns `undefined` when nothing is configured.
 *
 * - `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` → Google Search Console.
 * - `NEXT_PUBLIC_BING_SITE_VERIFICATION`   → Bing Webmaster Tools (`msvalidate.01`).
 */
export function resolveSiteVerification(): SiteVerification | undefined {
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();

  const verification: SiteVerification = {};
  if (google) {
    verification.google = google;
  }
  if (bing) {
    verification.other = { 'msvalidate.01': bing };
  }

  return Object.keys(verification).length > 0 ? verification : undefined;
}
