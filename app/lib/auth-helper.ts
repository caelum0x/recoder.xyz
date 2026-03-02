/**
 * Authentication Helper
 * Shared function to extract and validate user from Bearer token
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    // Find session by access token
    const session = await prisma.cli_sessions.findUnique({
      where: { accessToken: token },
      include: { users: true }
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return null;
    }

    return session.users;
  } catch (error) {
    logger.error('Token validation error', { error: String(error) });
    return null;
  }
}
