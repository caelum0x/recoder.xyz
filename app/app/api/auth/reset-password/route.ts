/**
 * Reset Password API Route
 * Handles password reset with token validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { validatePassword } from '@/lib/password-validation';

const passwordResetRateLimiter = rateLimit(rateLimitConfigs.passwordReset);

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 requests per hour
    const rateLimitResponse = await passwordResetRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { token, password, validate } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Reset token is required' },
        { status: 400 }
      );
    }

    // Hash the token to match stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find all password-reset verifications
    const verifications = await prisma.verifications.findMany({
      where: {
        value: hashedToken,
        expires_at: {
          gt: new Date()
        }
      }
    });

    // Find the password-reset verification
    const verification = verifications.find(v =>
      v.identifier.startsWith('password-reset:')
    );

    if (!verification) {
      return NextResponse.json(
        { valid: false, error: 'Invalid or expired reset link' },
        { status: 400 }
      );
    }

    // Extract email from identifier
    const email = verification.identifier.replace('password-reset:', '');

    // If just validating token
    if (validate) {
      return NextResponse.json({
        valid: true,
        message: 'Token is valid',
        email
      });
    }

    // Reset password
    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      );
    }

    // Validate password strength
    const validation = validatePassword(password);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.errors[0] || 'Password is too weak', errors: validation.errors },
        { status: 400 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user password
    await prisma.users.update({
      where: { email },
      data: {
        password: hashedPassword,
        updatedAt: new Date()
      }
    });

    // Delete the verification token (marking it as used)
    await prisma.verifications.delete({
      where: { id: verification.id }
    });

    // Revoke all existing sessions for security (Better Auth table)
    await prisma.session.deleteMany({
      where: {
        user: {
          email
        }
      }
    });

    console.log(`✅ Password reset successfully for ${email}`);

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully. Please sign in with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
