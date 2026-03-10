import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { extractSessionToken, parseSessionToken } from '@recoder/auth/edge';
import { getSignOutCookieAttributes } from '@recoder/auth/cross-domain';

export async function POST() {
  const cookieStore = await cookies();
  const rawToken = extractSessionToken(
    (name) => cookieStore.get(name)?.value ?? null
  );
  const sessionToken = rawToken ? parseSessionToken(rawToken) : null;

  // Best-effort session invalidation. Cookie clearing still proceeds on DB failures.
  if (sessionToken) {
    try {
      await prisma.session.deleteMany({
        where: { token: sessionToken },
      });
    } catch (error) {
      logger.error('Fallback logout session delete failed', {
        route: 'api/auth/logout',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const response = NextResponse.json({ success: true });
  for (const attrs of getSignOutCookieAttributes()) {
    response.cookies.set(attrs);
  }

  return response;
}
