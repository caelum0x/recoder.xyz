import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

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

  if (adminSecret && secretHeader && secretHeader === adminSecret) {
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
