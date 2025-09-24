import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyTOTP, getEncryptionKey, decryptData } from '@/lib/auth/2fa-utils';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { code, setup = false } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400 }
      );
    }

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

    // Determine which secret to use
    const secretToUse = user.totpSecret;
    
    if (!secretToUse) {
      return NextResponse.json(
        { error: '2FA not configured' },
        { status: 400 }
      );
    }

    // Decrypt the secret
    const encryptionKey = getEncryptionKey();
    const decryptedSecret = decryptData(secretToUse, encryptionKey);

    // Verify the TOTP code
    const isValid = verifyTOTP(code, decryptedSecret);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // If this is a setup verification, enable 2FA
    if (setup) {
      // Enable 2FA
      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: true
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Two-factor authentication enabled successfully'
      });
    }

    // For regular verification, return success
    return NextResponse.json({
      success: true,
      message: 'Verification successful'
    });

  } catch (error) {
    console.error('2FA verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}