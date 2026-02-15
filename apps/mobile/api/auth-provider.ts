import 'react-native-url-polyfill/auto';
import { getFrontendUrl } from '@/api/config';
import { log } from '@/lib/logger';

/**
 * Auth provider configuration — now backed by better-auth via the frontend.
 *
 * The frontend exposes `/api/auth/[...all]` which is the better-auth
 * catch-all handler.  The mobile app calls these endpoints directly.
 *
 * Legacy env vars (`EXPO_PUBLIC_AUTH_PROVIDER_URL`,
 * `EXPO_PUBLIC_AUTH_PROVIDER_ANON_KEY`) are no longer required.
 * If `EXPO_PUBLIC_AUTH_PROVIDER_URL` is set it is treated as the frontend
 * origin (for backward compat during rollout).
 */

const explicitUrl = process.env.EXPO_PUBLIC_AUTH_PROVIDER_URL || '';

/** better-auth does not use API keys — kept as empty string for compat. */
export const authProviderAnonKey = '';

export function getAuthProviderOrigin(): string {
  // Prefer explicit override, fall back to frontend URL
  const origin = explicitUrl || getFrontendUrl();
  return origin.replace(/\/$/, '');
}

export function getAuthProviderApiBase(): string {
  return `${getAuthProviderOrigin()}/api/auth`;
}

// Startup sanity check
const _origin = getAuthProviderOrigin();
if (!_origin || _origin === 'http://localhost:3000') {
  log.log('Auth provider using frontend URL:', _origin);
}
