import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

/**
 * Constant-time string comparison.
 *
 * Both inputs are hashed to a fixed 32-byte digest before comparison so that
 * the timingSafeEqual buffers are always equal length. This avoids leaking
 * either the length of the secret or how many leading bytes matched via a
 * short-circuiting `===` compare.
 */
function timingSafeCompare(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

export interface AdminAccess {
  via: 'session' | 'secret';
  userId?: string;
  email?: string;
}

export type AdminAccessResult =
  | { ok: true; admin: AdminAccess }
  | { ok: false; response: NextResponse };

export async function ensureAdminAccess(request: NextRequest): Promise<AdminAccessResult> {
  const adminSecret = process.env.ADMIN_SECRET;
  const secretHeader = request.headers.get('x-admin-secret');

  if (adminSecret && secretHeader && timingSafeCompare(secretHeader, adminSecret)) {
    return { ok: true, admin: { via: 'secret' } };
  }

  const auth = await requireAuth(request);
  if (auth.error) {
    return { ok: false, response: auth.response };
  }

  const viewer = await prisma.users.findFirst({
    where: {
      OR: [{ id: auth.user.id }, { email: auth.user.email }],
    },
    select: { id: true, email: true, role: true },
  });

  if (!viewer || viewer.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    admin: {
      via: 'session',
      userId: viewer.id,
      email: viewer.email,
    },
  };
}
