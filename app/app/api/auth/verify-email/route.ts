/**
 * Email Verification API Route
 * Handles email verification and resending verification emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmailProviderStatus, resolvePublicAppUrl, sendVerificationEmailWithCode } from '@/lib/email';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import {
  consumeVerification,
  createVerificationRecord,
  findValidVerificationByHashedValue,
} from '@/lib/auth/verification-store';

const authRateLimiter = rateLimit(rateLimitConfigs.auth);

async function markEmailVerifiedAcrossTables(email: string) {
  const prismaAny = prisma as unknown as {
    user?: {
      update: (args: {
        where: { email: string };
        data: { emailVerified: boolean; updatedAt: Date };
      }) => Promise<unknown>;
    };
  };

  await Promise.allSettled([
    prismaAny.user?.update
      ? prismaAny.user.update({
          where: { email },
          data: {
            emailVerified: true,
            updatedAt: new Date(),
          },
        })
      : Promise.resolve(null),
    prisma.users.update({
      where: { email },
      data: {
        emailVerified: true,
        updatedAt: new Date(),
      },
    }),
  ]);
}

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 5 requests per minute
    const rateLimitResponse = await authRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/auth/signin?error=invalid_token', request.url));
    }

    // Hash the token to match stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const verification = await findValidVerificationByHashedValue(hashedToken);

    if (!verification || !verification.identifier.startsWith('email-verify:')) {
      return NextResponse.redirect(new URL('/auth/signin?error=expired_token', request.url));
    }

    // Extract email from identifier
    const email = verification.identifier.replace('email-verify:', '');

    // Keep web and CLI identity state aligned regardless of link-vs-code verification path.
    await markEmailVerifiedAcrossTables(email);

    // Delete the verification token from both compatibility tables
    await consumeVerification(verification.identifier, hashedToken);

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
    // Rate limit: 5 requests per minute
    const rateLimitResponse = await authRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Only 'users' (plural) table exists
    const user = await prisma.users.findUnique({
      where: { email }
    });

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
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Generate 6-digit code (for code-based verification)
    const verificationCode = crypto.randomInt(100000, 999999).toString();

    // Store token + code in both verification compatibility tables
    await createVerificationRecord(`email-verify:${email}`, verificationToken, expiresAt);
    await createVerificationRecord(`email-code:${email}`, verificationCode, expiresAt);

    // Build full verification URL with code
    const baseUrl = resolvePublicAppUrl();
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
      emailProvider: getEmailProviderStatus().provider,
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
