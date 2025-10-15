/**
 * Forgot Password API Route
 * Handles password reset requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// Email service
async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}/auth/reset-password?token=${token}`;
  
  console.log(`📧 Password reset email would be sent to ${email}`);
  console.log(`🔗 Reset URL: ${resetUrl}`);
  
  // TODO: Implement with your email service
  // await emailService.send({
  //   to: email,
  //   subject: 'Reset your password - recoder.xyz',
  //   html: `Click here to reset your password: ${resetUrl}`
  // });
  
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Always return success to prevent email enumeration
    // Even if user doesn't exist, we return success
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return NextResponse.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token (you'll need to create PasswordReset table in Prisma schema)
    // TODO: Create proper PasswordReset model in Prisma
    // await prisma.passwordReset.create({
    //   data: {
    //     userId: user.id,
    //     token: hashedToken,
    //     expiresAt,
    //     used: false
    //   }
    // });

    await sendPasswordResetEmail(email, resetToken);

    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Rate limiting would be important here
// Implement rate limiting to prevent abuse
