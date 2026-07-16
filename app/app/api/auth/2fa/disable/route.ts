/**
 * 2FA Disable API
 * Disable 2FA after verifying current code
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { authenticator } from 'otplib';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { code } = body;

    if (!code || (code.length !== 6 && code.length !== 8)) {
      return NextResponse.json(
        { success: false, error: 'Invalid code format. Must be 6 digits (TOTP) or 8 characters (backup code).' },
        { status: 400 }
      );
    }

    // Get user's security settings
    const settings = await prisma.security_settings.findUnique({
      where: { userId },
    });

    if (!settings || !settings.twoFactorEnabled) {
      return NextResponse.json(
        { success: false, error: '2FA is not enabled' },
        { status: 400 }
      );
    }

    const secret = settings.twoFactorSecret;
    let isValid = false;

    // Check if it's a backup code
    if (code.length === 8) {
      const backupCodes = settings.backupCodes ?
        JSON.parse(settings.backupCodes as string) : [];

      const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
      isValid = backupCodes.includes(codeHash);
    } else {
      // Verify TOTP code
      isValid = authenticator.verify({
        token: code,
        secret: secret
      });
    }

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid code. Please try again.' },
        { status: 400 }
      );
    }

    // Disable 2FA and clear secret and backup codes
    await prisma.security_settings.update({
      where: { userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: '2FA has been disabled successfully'
    });

  } catch (error) {
    logger.error('[2FA Disable] Error:', { error: String(error), route: 'auth/2fa/disable' });
    return NextResponse.json(
      { success: false, error: 'Failed to disable 2FA' },
      { status: 500 }
    );
  }
}
