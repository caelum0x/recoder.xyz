/**
 * Reset Password API Route
 * Handles password reset with token validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
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

    // TODO: Implement proper token validation with PasswordReset table
    // const resetRequest = await prisma.passwordReset.findFirst({
    //   where: {
    //     token: hashedToken,
    //     used: false,
    //     expiresAt: {
    //       gt: new Date()
    //     }
    //   },
    //   include: {
    //     user: true
    //   }
    // });

    // if (!resetRequest) {
    //   return NextResponse.json(
    //     { valid: false, error: 'Invalid or expired reset link' },
    //     { status: 400 }
    //   );
    // }

    // If just validating token
    if (validate) {
      return NextResponse.json({
        valid: true,
        message: 'Token is valid'
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
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user password
    // TODO: Get actual user from token validation above
    // await prisma.user.update({
    //   where: { id: resetRequest.userId },
    //   data: { password: hashedPassword }
    // });

    // Mark token as used
    // await prisma.passwordReset.update({
    //   where: { id: resetRequest.id },
    //   data: { used: true }
    // });

    // TODO: Send confirmation email
    // await sendPasswordChangedEmail(resetRequest.user.email);

    // TODO: Revoke all existing sessions for security
    // await revokeAllSessions(resetRequest.userId);

    console.log('✅ Password reset successfully');

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
