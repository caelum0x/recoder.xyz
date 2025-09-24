/**
 * Two-Factor Authentication Status API
 * GET /api/auth/2fa/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user session
    const session = await requireAuth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user with 2FA data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        twoFactorEnabled: true,
        totpSecret: true,
        backupCodes: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Return 2FA status
    return NextResponse.json({
      enabled: user.twoFactorEnabled,
      setup: !!user.totpSecret,
      backupCodesAvailable: !!user.backupCodes
    });

  } catch (error) {
    console.error('2FA status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}