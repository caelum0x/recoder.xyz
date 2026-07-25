/**
 * Shared authorization for the SEO submission endpoints (IndexNow, Bing). A
 * submission is a write action, so it is gated: the caller must present EITHER a
 * valid internal-service signature (`x-internal-*`, for server-to-server content
 * flows) OR the admin secret header (`x-admin-secret`, for an owner-triggered
 * submit). DB-free (header-based) so the routes stay cheap and testable.
 *
 * One shared copy so the two routes' security check can never drift apart.
 */

import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';

/** Constant-time compare of two secrets (hash to fixed length first). */
function timingSafeCompare(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Authorize a submission request. Returns `{ ok: true }` when the internal
 * signature validates or the admin secret matches; otherwise `{ ok: false }`
 * with a truthful reason and no side effects (the caller makes no network call).
 */
export function authorizeSubmitRequest(
  request: NextRequest,
  rawBody: string,
): { ok: true } | { ok: false; reason: string } {
  const internal = verifyInternalServiceRequest(request, { rawBody });
  if (internal.ok) return { ok: true };

  const adminSecret = (process.env.ADMIN_SECRET || '').trim();
  const header = (request.headers.get('x-admin-secret') || '').trim();
  if (adminSecret && header && timingSafeCompare(header, adminSecret)) {
    return { ok: true };
  }

  // `in`-narrowing (robust under the app's non-strict tsconfig, where boolean
  // discriminant narrowing on `internal.ok` does not narrow the union).
  const reason = 'reason' in internal ? internal.reason : 'unauthorized';
  return { ok: false, reason };
}
