/**
 * Server half of the mobile magic-link handshake described in
 * apps/mobile/src/features/recoder-auth/connectAuthClient.ts (branch
 * feat/recoder-remote-mobile-2026-10-15) and RecoderAuthProvider.tsx's
 * `magicLinkCallbackUrl()`.
 *
 * The flow: the app calls `POST /api/auth/sign-in/magic-link` with
 * `callbackURL: "{CONNECT_URL}/link/mobile-complete"` — already same-origin
 * as `CONNECT_URL`, so Better Auth's `originCheck` accepts it with no
 * `trustedOrigins` change. Better Auth emails a verify link; clicking it hits
 * the plugin's built-in `GET /api/auth/magic-link/verify`, which creates a
 * session, sets the session cookie on its 302 response, and redirects the
 * browser to that same callbackURL. The browser's follow-up GET to
 * `/link/mobile-complete` therefore carries the fresh cookie — this module
 * reads the raw cookie value (not just "a session exists") because the
 * mobile app has no cookie jar (React Native `fetch`) and instead replays
 * this exact string as a manual `Cookie` header on every later request (see
 * `connectAuthClient.ts`'s `CONNECT_SESSION_COOKIE_NAME` comment — this name
 * is load-bearing on both sides and must move with `createConnectAuth`'s
 * `cookiePrefix`/`useSecureCookies`).
 *
 * The deep-link target scheme is read from env (`RECODER_REMOTE_SCHEME`),
 * never from a query param or any other request-controlled input — accepting
 * an attacker-chosen scheme here would be an open redirect that leaks a live
 * session token to an arbitrary app.
 */

/** Must match `createConnectAuth`'s `cookiePrefix: 'recoder_connect'` +
 * `useSecureCookies: true` (connect-auth.ts) — better-auth's cookie builder
 * turns that into `${cookiePrefix}.session_token`, `__Secure-`-prefixed. */
export const CONNECT_SESSION_COOKIE_NAME = '__Secure-recoder_connect.session_token';

export const DEFAULT_RECODER_REMOTE_SCHEME = 'recoder-remote';

/** Reads `RECODER_REMOTE_SCHEME` from env, falling back to the app's shipped
 * default (apps/mobile's `resolveAppScheme()`) so an unset env var still
 * produces a working deep link rather than a broken one. */
export function resolveRemoteScheme(env: { RECODER_REMOTE_SCHEME?: string }): string {
  const configured = env.RECODER_REMOTE_SCHEME?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_RECODER_REMOTE_SCHEME;
}

/** Extracts the raw session cookie value from an incoming request's `Cookie`
 * header, or `null` if it is not present (e.g. the verify step failed and no
 * session was created, or this route is hit directly without the redirect). */
export function extractSessionCookieValue(headers: Headers): string | null {
  const cookieHeader = headers.get('cookie');
  if (!cookieHeader) return null;
  const escapedName = CONNECT_SESSION_COOKIE_NAME.replace(/\./g, '\\.');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Builds the exact deep-link URL `parseAuthCallbackUrl` (connectAuthClient.ts)
 * expects: any URL under the app's own scheme carrying `token` (required)
 * and `email` (best-effort) query params — the path segment itself is not
 * inspected by the client, `auth/callback` is just a clear, conventional one. */
export function buildMobileDeepLink(opts: { readonly scheme: string; readonly token: string; readonly email: string }): string {
  const query = new URLSearchParams({ token: opts.token, email: opts.email });
  return `${opts.scheme}://auth/callback?${query.toString()}`;
}

export type MobileCompleteResult =
  | { readonly ok: true; readonly deepLink: string }
  | { readonly ok: false };

/**
 * Renders the tiny hand-off page. Deliberately plain HTML + inline script
 * (no framework, no external assets — this page is hit from an email client
 * or mobile browser, often with JS/cookies partially restricted) doing an
 * immediate `location.replace` to the custom scheme, with a visible manual
 * link as a fallback for browsers that block the automatic redirect.
 */
export function renderMobileCompletePage(result: MobileCompleteResult): string {
  if (!result.ok) {
    return [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<title>Sign-in link expired</title></head><body>',
      '<p>This sign-in link is invalid or has expired. Go back to Recoder Remote and request a new one.</p>',
      '</body></html>',
    ].join('');
  }
  const escapedLink = result.deepLink.replace(/"/g, '&quot;');
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<title>Signing in…</title></head><body>',
    `<script>location.replace("${escapedLink}");</script>`,
    `<p>Signed in. If Recoder Remote did not open automatically, <a href="${escapedLink}">tap here</a>.</p>`,
    '</body></html>',
  ].join('');
}
