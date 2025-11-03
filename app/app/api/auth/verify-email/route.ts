/**
 * Email Verification API Route
 * Handles email verification and resending verification emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendVerificationEmail } from '@/lib/email';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/auth/signin?error=invalid_token', request.url));
    }

    // Hash the token to match stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find verification token
    const verifications = await prisma.verifications.findMany({
      where: {
        value: hashedToken,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    const verification = verifications.find(v =>
      v.identifier.startsWith('email-verify:')
    );

    if (!verification) {
      return NextResponse.redirect(new URL('/auth/signin?error=expired_token', request.url));
    }

    // Extract email from identifier
    const email = verification.identifier.replace('email-verify:', '');

    // Update user email verified status
    await prisma.users.update({
      where: { email },
      data: {
        emailVerified: true,
        updatedAt: new Date()
      }
    });

    // Delete the verification token
    await prisma.verifications.delete({
      where: { id: verification.id }
    });

    console.log(`✅ Email verified for ${email}`);

    // Redirect to signin with success message
    return NextResponse.redirect(new URL('/auth/signin?verified=true', request.url));

  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.redirect(new URL('/auth/signin?error=verification_failed', request.url));
  }
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

    const user = await prisma.users.findUnique({
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
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token in verifications table
    await prisma.verifications.create({
      data: {
        id: crypto.randomUUID(),
        identifier: `email-verify:${email}`,
        value: hashedToken,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    console.log(`✅ Verification email sent to ${email}`);

    return NextResponse.json({
      success: true,
      message: 'Verification email sent. Please check your inbox.'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
