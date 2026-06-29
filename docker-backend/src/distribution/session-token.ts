/**
 * Extract a recoder.xyz Better-Auth session token from a request — Authorization
 * bearer first, then the known session cookie names. Mirrors docker-backend's
 * existing `getSessionTokenFromRequest` so the device-authorize browser step
 * sees the same cookie the rest of the platform trusts.
 */
import type { Request } from 'express';

const SESSION_COOKIE_NAMES = [
  '__Secure-recoder.session_token',
  'recoder.session_token',
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  '__Secure-session_token',
  'recoder_session_token',
  'session_token',
];

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const cookie of cookieHeader.split(';')) {
    const idx = cookie.indexOf('=');
    if (idx < 0) continue;
    const name = cookie.slice(0, idx).trim();
    const value = cookie.slice(idx + 1).trim();
    if (name && value) {
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    }
  }
  return out;
}

export function getSessionTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice('Bearer '.length).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  for (const name of SESSION_COOKIE_NAMES) {
    if (cookies[name]) return cookies[name];
  }
  return null;
}
