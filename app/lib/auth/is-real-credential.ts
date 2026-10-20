/**
 * Detects obviously-unfilled template placeholder values in OAuth / API-key
 * env vars, so misconfigured deployments fail fast instead of silently
 * sending real users through an OAuth flow with a garbage client_id.
 *
 * Found live in production (2026-10-21): a stray appended block in the
 * box's env file re-declared GOOGLE_CLIENT_ID/GITHUB_CLIENT_ID (and their
 * secrets) with their literal, unfilled `.env.example` placeholder strings
 * further down the same file, shadowing the real credentials declared
 * earlier. The old check here only rejected values starting with the exact
 * word "placeholder" — it let "your-google-oauth-client-id" through as
 * "real", so the app confidently built a Google/GitHub social-provider
 * config out of template text. Hardened to also reject the common
 * "your-..."/"your_..." template convention used across this repo's own
 * .env.example files.
 */
const PLACEHOLDER_PREFIXES = ['placeholder', 'your-', 'your_'];

export function isRealCredential(val: string): boolean {
  const trimmed = val.trim();
  if (trimmed.length === 0) return false;
  const lower = trimmed.toLowerCase();
  return !PLACEHOLDER_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
