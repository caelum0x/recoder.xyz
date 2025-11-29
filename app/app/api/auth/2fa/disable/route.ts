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
    const settings = await prisma.$queryRaw<any[]>`
      SELECT * FROM security_settings WHERE user_id = ${userId}
    `;

    if (!settings || settings.length === 0 || !settings[0].two_factor_enabled) {
      return NextResponse.json(
        { success: false, error: '2FA is not enabled' },
        { status: 400 }
      );
    }

    const secret = settings[0].two_factor_secret;
    let isValid = false;

    // Check if it's a backup code
    if (code.length === 8) {
      const backupCodes = settings[0].backup_codes ?
        JSON.parse(settings[0].backup_codes as string) : [];

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
    await prisma.$executeRaw`
      UPDATE security_settings
      SET
        two_factor_enabled = false,
        two_factor_secret = NULL,
        backup_codes = NULL,
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;

    return NextResponse.json({
      success: true,
      message: '2FA has been disabled successfully'
    });

  } catch (error: any) {
    console.error('[2FA Disable] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to disable 2FA' },
      { status: 500 }
    );
  }
}
