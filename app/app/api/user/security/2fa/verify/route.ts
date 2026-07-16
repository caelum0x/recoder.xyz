import { NextRequest, NextResponse } from 'next/server';
import { assertTwoFactorVerifyResponse } from '@/lib/contracts/security-contracts';
import { TwoFactorAuthService } from '@/lib/services/2fa.service';
import { requireAuth } from '@/lib/auth-helpers';

/**
 * POST /api/user/security/2fa/verify
 * Verify 2FA token for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Missing required field: token' },
        { status: 400 }
      );
    }

    const userId = authResult.user.id;
    const result = await TwoFactorAuthService.verify2FALogin(userId, token);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 401 }
      );
    }

    return NextResponse.json(assertTwoFactorVerifyResponse({
      success: true,
      message: result.message,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to verify 2FA' },
      { status: 500 }
    );
  }
}
