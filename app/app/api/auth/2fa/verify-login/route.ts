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
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

const authRateLimiter = rateLimit(rateLimitConfigs.auth);

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 requests per minute
    const rateLimitResponse = await authRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

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
    const settings = await prisma.security_settings.findUnique({
      where: { userId },
    });

    if (!settings || !settings.twoFactorEnabled) {
      return NextResponse.json(
        { success: false, error: '2FA is not enabled for this user' },
        { status: 400 }
      );
    }

    const secret = settings.twoFactorSecret;
    let isValid = false;

    // Check if it's a backup code (8 characters)
    if (code.length === 8) {
      const backupCodes = settings.backupCodes ?
        JSON.parse(settings.backupCodes as string) : [];

      const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
      const backupCodeIndex = backupCodes.indexOf(codeHash);

      if (backupCodeIndex !== -1) {
        isValid = true;
        // Remove used backup code
        backupCodes.splice(backupCodeIndex, 1);
        await prisma.security_settings.update({
          where: { userId },
          data: { backupCodes: JSON.stringify(backupCodes) },
        });
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
    logger.error('[2FA Login Verify] Error:', { error: String(error), route: 'auth/2fa/verify-login' });
    return NextResponse.json(
      { success: false, error: 'Failed to verify 2FA code' },
      { status: 500 }
    );
  }
}
