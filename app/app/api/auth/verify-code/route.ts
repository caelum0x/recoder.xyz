/**
 * Verification Code API Route
 * Handles 6-digit code verification
 *
 * POST /api/auth/verify-code
 * Body: { code: "123456", email?: "user@example.com" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import {
  consumeVerification,
  findValidVerificationByIdentifierAndHashedValue,
  findValidVerificationByIdentifierPrefixAndHashedValue,
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

  const results = await Promise.allSettled([
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

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.info('Verification update skipped for one user table', {
        route: 'api/auth/verify-code',
        email,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 requests per minute
    const rateLimitResponse = await authRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { code, email } = body;

    if (!code || code.length !== 6) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification code format. Please enter a 6-digit code.' },
        { status: 400 }
      );
    }

    // Hash the code to match stored hash (codes are stored as hashed values)
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

    // Find verification by code
    // Codes are stored with identifier 'email-code:{email}'
    let verification = null;

    if (email) {
      verification = await findValidVerificationByIdentifierAndHashedValue(
        `email-code:${email}`,
        hashedCode
      );
    } else {
      verification = await findValidVerificationByIdentifierPrefixAndHashedValue(
        'email-code:',
        hashedCode
      );
    }

    if (!verification) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired verification code. Please request a new code.' },
        { status: 400 }
      );
    }

    // Extract email from identifier
    const verifiedEmail = verification.identifier.replace('email-code:', '');

    await markEmailVerifiedAcrossTables(verifiedEmail);
    await consumeVerification(verification.identifier, hashedCode);

    logger.info('Email verified via code', { route: 'api/auth/verify-code', email: verifiedEmail });

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully!',
      email: verifiedEmail
    });

  } catch (error) {
    logger.error('Code verification error', { route: 'api/auth/verify-code', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Verification failed. Please try again.' },
      { status: 500 }
    );
  }
}

// GET endpoint to check code status
export async function GET(request: NextRequest) {
  // Rate limit: 5 requests per minute
  const rateLimitResponse = await authRateLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { success: false, error: 'Code parameter required' },
      { status: 400 }
    );
  }

  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

  const verification = await findValidVerificationByIdentifierPrefixAndHashedValue(
    'email-code:',
    hashedCode
  );

  return NextResponse.json({
    success: !!verification,
    valid: !!verification,
    expiresAt: verification?.expiresAt || null
  });
}
