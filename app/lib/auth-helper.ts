/**
 * Authentication Helper
 * Shared function to extract and validate user from Bearer token
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    // Find session by access token
    const session = await prisma.cLISession.findUnique({
      where: { accessToken: token },
      include: { user: true }
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return null;
    }

    return session.user;
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
}
