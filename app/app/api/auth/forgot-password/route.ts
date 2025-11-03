/**
 * Forgot Password API Route
 * Handles password reset requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/email';
import crypto from 'crypto';

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

    // Find user (check both User and users tables for compatibility)
    let user = await prisma.users.findUnique({
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

    // Store token in verifications table (reusing existing table)
    await prisma.verifications.create({
      data: {
        id: crypto.randomUUID(),
        identifier: `password-reset:${email}`,
        value: hashedToken,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });

    // Send password reset email
    await sendPasswordResetEmail(email, resetToken);

    console.log(`✅ Password reset email sent to ${email}`);

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
