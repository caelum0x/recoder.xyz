import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TwoFactorAuthService } from '@/lib/services/2fa.service';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/user/security/2fa/setup
 * Setup 2FA - generate secret and QR code
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const result = await TwoFactorAuthService.setup2FA(user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      secret: result.secret,
      qrCodeURL: result.qrCode,
      message: result.message,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to setup 2FA', message: error.message },
      { status: 500 }
    );
  }
}
