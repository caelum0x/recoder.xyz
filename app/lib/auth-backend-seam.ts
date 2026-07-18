/**
 * Backend auth seam — read the current session from the ONE backend-owned
 * Better Auth authority (Phase A, RECODER-NEXT-PHASE.md).
 *
 * The website already PROXIES auth *flows* (sign-in/up/social/sign-out) to the
 * backend via `/api/auth/[...all]`. This module lets server-side session READS
 * (getSession/requireAuth and everything funnelling through them) resolve
 * against that same backend authority instead of the website's own local
 * Better Auth engine + direct Prisma reads.
 *
 * SAFETY: this is strictly ADDITIVE and OFF by default. It is gated behind
 * `RECODER_AUTH_BACKEND_SEAM`; when the flag is unset the function returns
 * `null` immediately and callers keep their existing local behavior byte-for-
 * byte. Even when enabled, a POSITIVE backend session is used, but a negative
 * or unreachable backend returns `null` and the caller FALLS BACK to the local
 * path — so a backend blip can never lock users out. Full cutover (making the
 * backend authoritative and deleting the compat bridge) is a later runbook step.
 */
import { logger } from '@/lib/logger';

/** Minimal user shape the website session consumers need. */
export interface BackendSeamUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export interface BackendSeamSession {
  user: BackendSeamUser;
  /** ISO-8601 session expiry. */
  expiresAt: string;
}

/** The control-plane backend origin (prod: pm2 recoder-backend on :8000). */
function backendUrl(env: NodeJS.ProcessEnv): string {
  return (
    env.RECODER_BACKEND_URL ||
    env.BACKEND_URL ||
    'http://127.0.0.1:8000'
  ).replace(/\/+$/, '');
}

/** Whether the backend seam read is enabled for this deployment. */
export function isBackendSeamEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.RECODER_AUTH_BACKEND_SEAM || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

/**
 * Narrow Better Auth's `GET /api/auth/get-session` body into our seam shape.
 * Returns null for any body that does not carry a real user + expiry.
 */
function parseGetSessionBody(body: unknown): BackendSeamSession | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const user = record.user as Record<string, unknown> | undefined;
  const session = record.session as Record<string, unknown> | undefined;
  if (!user || typeof user !== 'object') return null;

  const id = typeof user.id === 'string' ? user.id : null;
  const email = typeof user.email === 'string' ? user.email : null;
  if (!id || !email) return null;

  const expiresRaw = session?.expiresAt ?? session?.expires;
  let expiresAt: string;
  if (typeof expiresRaw === 'string') {
    expiresAt = expiresRaw;
  } else if (expiresRaw instanceof Date) {
    expiresAt = expiresRaw.toISOString();
  } else {
    // Better Auth always includes session.expiresAt on a valid session; if it
    // is missing, treat the payload as not-a-session rather than fabricating one.
    return null;
  }

  return {
    user: {
      id,
      email,
      name: typeof user.name === 'string' ? user.name : email.split('@')[0],
      image: typeof user.image === 'string' ? user.image : null,
    },
    expiresAt,
  };
}

/**
 * Resolve the current session from the backend Better Auth authority.
 *
 * @param cookieHeader raw `Cookie` header value carrying the session cookie.
 * @returns the session when the backend reports a valid one; otherwise `null`
 *          (flag off, no cookie, no session, or backend unreachable). NEVER
 *          throws — callers must be able to fall back safely.
 */
export async function fetchBackendSession(
  cookieHeader: string | null | undefined,
  deps: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<BackendSeamSession | null> {
  const env = deps.env ?? process.env;
  if (!isBackendSeamEnabled(env)) return null;
  if (!cookieHeader) return null;

  const fetchImpl = deps.fetchImpl ?? fetch;
  const target = `${backendUrl(env)}/api/auth/get-session`;

  try {
    const res = await fetchImpl(target, {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
        accept: 'application/json',
      },
      // Never let a slow/hung backend stall a page render; fall back instead.
      signal: AbortSignal.timeout(2500),
    });

    if (!res.ok) {
      // 401/anonymous and 5xx alike -> fall back to local resolution.
      return null;
    }

    const text = await res.text();
    if (!text || text === 'null') return null;

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return null;
    }
    return parseGetSessionBody(body);
  } catch (error) {
    // Unreachable / timeout / abort — degrade to the local path truthfully.
    logger.warn('Backend auth seam read failed; falling back to local session', {
      error: String(error),
    });
    return null;
  }
}
