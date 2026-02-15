/**
 * 2FA Setup API
 * Generate TOTP secret and QR code for authenticator apps
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
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
    const userEmail = session.user.email;

    // Generate TOTP secret
    const secret = authenticator.generateSecret();

    // Generate OTP auth URL for QR code
    const otpauthUrl = authenticator.keyuri(
      userEmail || 'user',
      'Recoder',
      secret
    );

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Generate 10 backup codes (8 characters each)
    const backupCodes = Array.from({ length: 10 }, () => {
      return crypto.randomBytes(4).toString('hex').toUpperCase();
    });

    // Hash backup codes before storing
    const hashedBackupCodes = backupCodes.map(code =>
      crypto.createHash('sha256').update(code).digest('hex')
    );

    // Check if security settings exist for user
    const existingSettings = await prisma.$queryRaw<any[]>`
      SELECT * FROM security_settings WHERE user_id = ${userId}
    `;

    if (existingSettings && existingSettings.length > 0) {
      // Update existing settings with new secret (but don't enable yet)
      await prisma.$executeRaw`
        UPDATE security_settings
        SET
          two_factor_secret = ${secret},
          backup_codes = ${JSON.stringify(hashedBackupCodes)},
          updated_at = NOW()
        WHERE user_id = ${userId}
      `;
    } else {
      // Create new security settings
      await prisma.$executeRaw`
        INSERT INTO security_settings (
          user_id,
          two_factor_enabled,
          two_factor_secret,
          backup_codes,
          session_timeout,
          created_at,
          updated_at
        )
        VALUES (
          ${userId},
          false,
          ${secret},
          ${JSON.stringify(hashedBackupCodes)},
          30,
          NOW(),
          NOW()
        )
      `;
    }

    return NextResponse.json({
      success: true,
      qrCode: qrCodeDataUrl,
      secret: secret, // Needed for manual entry in authenticator apps
      backupCodes: backupCodes, // Send plain text codes (only shown once)
      message: 'Scan this QR code with your authenticator app, then verify with a code to enable 2FA'
    });

  } catch (error: any) {
    console.error('[2FA Setup] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to setup 2FA' },
      { status: 500 }
    );
  }
}
