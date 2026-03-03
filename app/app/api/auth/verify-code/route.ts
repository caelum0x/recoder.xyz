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
import {
  consumeVerification,
  findValidVerificationByIdentifierAndHashedValue,
  findValidVerificationByIdentifierPrefixAndHashedValue,
} from '@/lib/auth/verification-store';

async function markEmailVerifiedAcrossTables(email: string) {
  const results = await Promise.allSettled([
    prisma.user.update({
      where: { email },
      data: {
        emailVerified: true,
        updatedAt: new Date(),
      },
    }),
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

  } catch (error: any) {
    logger.error('Code verification error', { route: 'api/auth/verify-code', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Verification failed. Please try again.' },
      { status: 500 }
    );
  }
}

// GET endpoint to check code status
export async function GET(request: NextRequest) {
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
