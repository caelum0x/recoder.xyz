/**
 * Forgot Password API Route
 * Handles password reset requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolvePublicAppUrl, sendPasswordResetEmail } from '@/lib/email';
import crypto from 'crypto';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

const passwordResetRateLimiter = rateLimit(rateLimitConfigs.passwordReset);

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 requests per hour
    const rateLimitResponse = await passwordResetRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user across both app users and Better Auth users.
    const appUser = await prisma.users.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    const prismaAny = prisma as unknown as {
      user?: { findUnique: (args: unknown) => Promise<{ id: string; email: string } | null> };
    };
    const authUser = prismaAny.user
      ? await prismaAny.user.findUnique({
          where: { email },
          select: { id: true, email: true },
        })
      : null;
    const userEmail = appUser?.email || authUser?.email || null;

    // Always return success to prevent email enumeration
    // Even if user doesn't exist, we return success
    if (!userEmail) {
      return NextResponse.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in verifications table (reusing existing table)
    await prisma.verifications.deleteMany({
      where: {
        identifier: `password-reset:${userEmail}`
      }
    });

    await prisma.verifications.create({
      data: {
        id: crypto.randomUUID(),
        identifier: `password-reset:${userEmail}`,
        value: hashedToken,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      }
    });

    const appUrl = resolvePublicAppUrl();
    const resetUrl = `${appUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;

    // Send password reset email
    const emailResult = await sendPasswordResetEmail(userEmail, resetUrl);
    if (!emailResult.success) {
      console.error('❌ Password reset email failed to send', emailResult.error);
      return NextResponse.json(
        { success: false, error: 'Failed to send reset email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    // Keep a non-enumerating contract even during transient DB/provider outages.
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent'
    });
  }
}
