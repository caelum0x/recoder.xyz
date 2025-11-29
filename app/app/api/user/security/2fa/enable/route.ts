import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { TwoFactorAuthService } from '@/lib/services/2fa.service';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/user/security/2fa/enable
 * Enable 2FA after verifying token
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;
    if (!authUser?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Verification token required' },
        { status: 400 }
      );
    }

    const result = await TwoFactorAuthService.enable2FA(user.id, token);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      backupCodes: result.backupCodes,
      message: result.message,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to enable 2FA', message: error.message },
      { status: 500 }
    );
  }
}
