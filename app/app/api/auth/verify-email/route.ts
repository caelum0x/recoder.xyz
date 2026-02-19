/**
 * Email Verification API Route
 * Handles email verification and resending verification emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendVerificationEmail, sendVerificationEmailWithCode } from '@/lib/email';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

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
        expires_at: {
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

    // Update user email verified status in BOTH tables
    // Better Auth's user table (web logins)
    try {
      await prisma.user.update({
        where: { email },
        data: {
          emailVerified: true,
          updatedAt: new Date()
        }
      });
    } catch (e) {
      // User might not exist in this table - that's OK
      logger.info('User not in user table (Better Auth)', { route: 'api/auth/verify-email', email });
    }

    // CLI users table
    try {
      await prisma.users.update({
        where: { email },
        data: {
          emailVerified: true,
          updatedAt: new Date()
        }
      });
    } catch (e) {
      // User might not exist in this table - that's OK
      logger.info('User not in users table (CLI)', { route: 'api/auth/verify-email', email });
    }

    // Delete the verification token
    await prisma.verifications.delete({
      where: { id: verification.id }
    });

    logger.info('Email verified', { route: 'api/auth/verify-email', email });

    // Redirect to signin with success message
    return NextResponse.redirect(new URL('/auth/signin?verified=true', request.url));

  } catch (error) {
    logger.error('Email verification error', { route: 'api/auth/verify-email', error: error instanceof Error ? error.message : String(error) });
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

    // Check BOTH user tables (web and CLI sign-ups)
    const webUser = await prisma.user.findUnique({
      where: { email }
    });
    const cliUser = await prisma.users.findUnique({
      where: { email }
    });

    const user = webUser || cliUser;

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found. Please sign up first.' },
        { status: 404 }
      );
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { success: false, error: 'Email already verified. You can sign in.' },
        { status: 400 }
      );
    }

    // Generate new verification token (for link-based verification)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Generate 6-digit code (for code-based verification)
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto.createHash('sha256').update(verificationCode).digest('hex');

    // Store token in verifications table (link-based)
    await prisma.verifications.create({
      data: {
        id: crypto.randomUUID(),
        identifier: `email-verify:${email}`,
        value: hashedToken,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      }
    });

    // Store code in verifications table (code-based)
    await prisma.verifications.create({
      data: {
        id: crypto.randomUUID(),
        identifier: `email-code:${email}`,
        value: hashedCode,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      }
    });

    // Build full verification URL with code
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
    const verificationUrl = `${baseUrl}/verify?code=${verificationCode}&email=${encodeURIComponent(email)}`;

    // Send verification email with code and URL
    const emailResult = await sendVerificationEmailWithCode(email, verificationCode, verificationUrl);

    logger.info('Verification email sent', { route: 'api/auth/verify-email', email });

    // In development, include the verification token for testing
    const isDev = process.env.NODE_ENV === 'development';
    const showTestData = isDev || process.env.SHOW_TEST_CREDENTIALS === 'true';

    return NextResponse.json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
      emailSent: emailResult.success,
      emailProvider: process.env.RESEND_API_KEY ? 'Resend' : (process.env.SMTP_USER ? 'SMTP' : 'Dev'),
      // Include verification data in dev mode for testing
      ...(showTestData && {
        _dev: {
          verificationCode,
          verificationToken,
          verificationUrl,
          note: 'This is only shown in development mode for testing'
        }
      })
    });

  } catch (error) {
    logger.error('Email verification error', { route: 'api/auth/verify-email', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
