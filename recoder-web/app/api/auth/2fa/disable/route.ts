/**
 * Two-Factor Authentication Disable API
 * POST /api/auth/2fa/disable
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server-auth';
import { prisma } from '@/lib/prisma';
import { verifyTOTP, verifyBackupCode } from '@/lib/auth/2fa-utils';
import { decryptData } from '@/lib/auth/encryption';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();
    
    const { code, backupCode } = await request.json();

    // Get user with 2FA data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
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

    if (!user.twoFactorEnabled) {
      return NextResponse.json(
        { error: 'Two-factor authentication is not enabled' },
        { status: 400 }
      );
    }

    // Verify the provided code (TOTP or backup code)
    let verificationSuccessful = false;

    if (code && user.totpSecret) {
      // Verify TOTP code
      const encryptionKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
      if (!encryptionKey) {
        return NextResponse.json(
          { error: 'Server configuration error' },
          { status: 500 }
        );
      }

      const decryptedSecret = decryptData(user.totpSecret, encryptionKey);
      verificationSuccessful = verifyTOTP(code, decryptedSecret);
    } else if (backupCode && user.backupCodes) {
        // Verify backup code
        const backupCodes = JSON.parse(user.backupCodes as string);
        const unusedCodes = backupCodes.filter((bc: any) => !bc.used);
        
        if (unusedCodes.length > 0) {
          const hashedCodes = unusedCodes.map((bc: any) =>
            crypto.createHash('sha256').update(bc.code).digest('hex')
          );
          
          const verification = verifyBackupCode(backupCode, hashedCodes);
          verificationSuccessful = verification.valid;
        }
      }

    if (!verificationSuccessful) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        totpSecret: null,
        backupCodes: Prisma.JsonNull
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });

  } catch (error) {
    console.error('2FA disable error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to disable two-factor authentication' },
      { status: 500 }
    );
  }
}