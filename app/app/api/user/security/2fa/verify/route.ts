import { NextRequest, NextResponse } from 'next/server';
import { TwoFactorAuthService } from '@/lib/services/2fa.service';

/**
 * POST /api/user/security/2fa/verify
 * Verify 2FA token during login
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, token } = body;

    if (!userId || !token) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, token' },
        { status: 400 }
      );
    }

    const result = await TwoFactorAuthService.verify2FALogin(userId, token);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to verify 2FA', message: error.message },
      { status: 500 }
    );
  }
}
