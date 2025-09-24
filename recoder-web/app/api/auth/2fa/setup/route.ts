/**
 * Two-Factor Authentication Setup API
 * POST /api/auth/2fa/setup
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server-auth';
import {
  generateTOTPSecret,
  generateBackupCodes,
  generateTOTPQRCode,
  hashBackupCodes,
  getEncryptionKey,
  encryptData
} from '@/lib/auth/2fa-utils';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();
    
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true }
    });

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'User not found or invalid credentials' },
        { status: 404 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Check if 2FA is already enabled
    const existingUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true, totpSecret: true }
    });

    if (existingUser?.twoFactorEnabled && existingUser?.totpSecret) {
      return NextResponse.json(
        { error: 'Two-factor authentication is already enabled' },
        { status: 400 }
      );
    }

    // Generate 2FA secret
    const secret = generateTOTPSecret();
    
    // Generate backup codes
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = hashBackupCodes(backupCodes);

    // Generate QR code for authenticator apps
    const qrCodeDataUrl = await generateTOTPQRCode(
      secret,
      session.user.email
    );

    // Encrypt the secret for storage
    const encryptionKey = getEncryptionKey();
    const encryptedSecret = encryptData(secret, encryptionKey);

    // Store temporary setup data (don't enable 2FA until verified)
    const setupData = {
      secret: encryptedSecret,
      backupCodes: hashedBackupCodes,
      qrCode: qrCodeDataUrl,
      createdAt: new Date()
    };

    // Update user with temporary setup data
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        totpSecret: encryptedSecret,
        backupCodes: JSON.stringify(hashedBackupCodes)
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        secret,
        qrCode: qrCodeDataUrl,
        backupCodes,
        manualEntryKey: secret // For manual entry in authenticator apps
      }
    });

  } catch (error) {
    console.error('2FA setup error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to setup two-factor authentication' },
      { status: 500 }
    );
  }
}