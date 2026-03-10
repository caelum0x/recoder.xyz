/**
 * 2FA Verify API
 * Verify TOTP code to enable 2FA or during login
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { authenticator } from 'otplib';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

const authRateLimiter = rateLimit(rateLimitConfigs.auth);

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 requests per minute
    const rateLimitResponse = await authRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

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

    if (!code || code.length !== 6) {
      return NextResponse.json(
        { success: false, error: 'Invalid code format. Must be 6 digits.' },
        { status: 400 }
      );
    }

    // Get user's security settings
    const settings = await prisma.security_settings.findUnique({
      where: { userId },
    });

    if (!settings || !settings.twoFactorSecret) {
      return NextResponse.json(
        { success: false, error: '2FA not set up. Please set up 2FA first.' },
        { status: 400 }
      );
    }

    const secret = settings.twoFactorSecret;
    const isAlreadyEnabled = settings.twoFactorEnabled;

    // Check if it's a backup code
    if (code.length === 8) {
      const backupCodes = settings.backupCodes ?
        JSON.parse(settings.backupCodes as string) : [];

      const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
      const backupCodeIndex = backupCodes.indexOf(codeHash);

      if (backupCodeIndex !== -1) {
        // Valid backup code - remove it so it can't be reused
        backupCodes.splice(backupCodeIndex, 1);

        await prisma.security_settings.update({
          where: { userId },
          data: { backupCodes: JSON.stringify(backupCodes) },
        });

        return NextResponse.json({
          success: true,
          message: 'Backup code verified successfully',
          isBackupCode: true,
          remainingBackupCodes: backupCodes.length
        });
      }
    }

    // Verify TOTP code
    const isValid = authenticator.verify({
      token: code,
      secret: secret
    });

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid code. Please try again.' },
        { status: 400 }
      );
    }

    // If 2FA is not yet enabled, enable it now (this is the setup verification)
    if (!isAlreadyEnabled) {
      await prisma.security_settings.update({
        where: { userId },
        data: { twoFactorEnabled: true },
      });

      return NextResponse.json({
        success: true,
        message: '2FA enabled successfully! Your account is now more secure.',
        enabled: true
      });
    }

    // If already enabled, this is a login verification
    return NextResponse.json({
      success: true,
      message: 'Code verified successfully',
      enabled: true
    });

  } catch (error) {
    logger.error('[2FA Verify] Error:', { error: String(error), route: 'auth/2fa/verify' });
    return NextResponse.json(
      { success: false, error: 'Failed to verify code' },
      { status: 500 }
    );
  }
}
