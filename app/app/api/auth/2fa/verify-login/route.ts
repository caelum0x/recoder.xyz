/**
 * 2FA Login Verification API
 * Complete login after 2FA code verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticator } from 'otplib';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { getApiKeyStatus } from '@/lib/api-key-resolver';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code, email, password } = body;

    if (!userId || !code) {
      return NextResponse.json(
        { success: false, error: 'User ID and code are required' },
        { status: 400 }
      );
    }

    // Get user with quota
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: {
        quota: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get security settings
    const settings = await prisma.$queryRaw<any[]>`
      SELECT * FROM security_settings WHERE user_id = ${userId}
    `;

    if (!settings || settings.length === 0 || !settings[0].two_factor_enabled) {
      return NextResponse.json(
        { success: false, error: '2FA is not enabled for this user' },
        { status: 400 }
      );
    }

    const secret = settings[0].two_factor_secret;
    let isValid = false;

    // Check if it's a backup code (8 characters)
    if (code.length === 8) {
      const backupCodes = settings[0].backup_codes ?
        JSON.parse(settings[0].backup_codes as string) : [];

      const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
      const backupCodeIndex = backupCodes.indexOf(codeHash);

      if (backupCodeIndex !== -1) {
        isValid = true;
        // Remove used backup code
        backupCodes.splice(backupCodeIndex, 1);
        await prisma.$executeRaw`
          UPDATE security_settings
          SET backup_codes = ${JSON.stringify(backupCodes)},
              updated_at = NOW()
          WHERE user_id = ${userId}
        `;
      }
    } else if (code.length === 6) {
      // Verify TOTP code
      isValid = authenticator.verify({
        token: code,
        secret: secret
      });
    }

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid 2FA code' },
        { status: 401 }
      );
    }

    // 2FA verified! Now complete the login
    // Generate access and refresh tokens
    const accessToken = `rct_${nanoid(32)}`;
    const refreshToken = `rcr_${nanoid(32)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create CLI session
    await prisma.cli_sessions.create({
      data: {
        id: nanoid(),
        userId: user.id,
        deviceName: 'Web Browser',
        deviceType: 'web',
        accessToken,
        refreshToken,
        expiresAt,
        isActive: true,
      },
    });

    // Update last login
    await prisma.users.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Get API key status
    const apiKeyStatus = await getApiKeyStatus(user.id);

    // Get quota info
    const quota = user.quota || null;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.subscription,
        apiKeyStatus,
        quota: quota ? {
          remaining: quota.sessionsPerDay - quota.sessionsUsedToday,
          limit: quota.sessionsPerDay,
          tokensPerSession: quota.tokensPerSession,
          resetDate: quota.periodEnd.toISOString()
        } : null
      },
      session: {
        accessToken,
        refreshToken,
        expiresAt: expiresAt.toISOString()
      }
    });

  } catch (error: any) {
    console.error('[2FA Login Verify] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to verify 2FA code' },
      { status: 500 }
    );
  }
}
