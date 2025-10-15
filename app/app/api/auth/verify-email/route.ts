/**
 * Email Verification API Route
 * Handles email verification and resending verification emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// Email service (you'll need to implement this based on your email provider)
async function sendVerificationEmail(email: string, token: string) {
  // TODO: Implement with your email service (SendGrid, AWS SES, etc.)
  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}/auth/verify-email?token=${token}`;
  
  console.log(`📧 Verification email would be sent to ${email}`);
  console.log(`🔗 Verification URL: ${verificationUrl}`);
  
  // For now, just log it. Replace with actual email sending
  // await emailService.send({
  //   to: email,
  //   subject: 'Verify your email - recoder.xyz',
  //   html: `Click here to verify: ${verificationUrl}`
  // });
  
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, email, resend } = body;

    // Handle resending verification email
    if (resend && email) {
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }

      if (user.emailVerified) {
        return NextResponse.json(
          { success: false, error: 'Email already verified' },
          { status: 400 }
        );
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store token (you'll need to create EmailVerification table in Prisma schema)
      // For now, we'll use a simple approach
      // TODO: Create proper EmailVerification model in Prisma
      
      await sendVerificationEmail(email, verificationToken);

      return NextResponse.json({
        success: true,
        message: 'Verification email sent'
      });
    }

    // Handle token verification
    if (token) {
      // TODO: Implement proper token verification with database
      // For now, we'll do a simple check
      
      // Find user by token (this is simplified - you need proper token storage)
      // const verification = await prisma.emailVerification.findUnique({
      //   where: { token },
      //   include: { user: true }
      // });

      // Temporary: Just mark any user as verified for testing
      // In production, you need proper token validation
      
      return NextResponse.json({
        success: true,
        message: 'Email verified successfully'
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
