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

    if (!code || code.length !== 6) {
      return NextResponse.json(
        { success: false, error: 'Invalid code format. Must be 6 digits.' },
        { status: 400 }
      );
    }

    // Get user's security settings
    const settings = await prisma.$queryRaw<any[]>`
      SELECT * FROM security_settings WHERE user_id = ${userId}
    `;

    if (!settings || settings.length === 0 || !settings[0].two_factor_secret) {
      return NextResponse.json(
        { success: false, error: '2FA not set up. Please set up 2FA first.' },
        { status: 400 }
      );
    }

    const secret = settings[0].two_factor_secret;
    const isAlreadyEnabled = settings[0].two_factor_enabled;

    // Check if it's a backup code
    if (code.length === 8) {
      const backupCodes = settings[0].backup_codes ?
        JSON.parse(settings[0].backup_codes as string) : [];

      const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
      const backupCodeIndex = backupCodes.indexOf(codeHash);

      if (backupCodeIndex !== -1) {
        // Valid backup code - remove it so it can't be reused
        backupCodes.splice(backupCodeIndex, 1);

        await prisma.$executeRaw`
          UPDATE security_settings
          SET backup_codes = ${JSON.stringify(backupCodes)},
              updated_at = NOW()
          WHERE user_id = ${userId}
        `;

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
      await prisma.$executeRaw`
        UPDATE security_settings
        SET two_factor_enabled = true,
            updated_at = NOW()
        WHERE user_id = ${userId}
      `;

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

  } catch (error: any) {
    console.error('[2FA Verify] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify code' },
      { status: 500 }
    );
  }
}
