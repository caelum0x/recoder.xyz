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
    let verification;

    if (email) {
      // If email is provided, look up specific verification
      verification = await prisma.verifications.findFirst({
        where: {
          identifier: `email-code:${email}`,
          value: hashedCode,
          expires_at: {
            gt: new Date()
          }
        }
      });
    } else {
      // Search all code-based verifications
      const verifications = await prisma.verifications.findMany({
        where: {
          identifier: {
            startsWith: 'email-code:'
          },
          value: hashedCode,
          expires_at: {
            gt: new Date()
          }
        }
      });

      verification = verifications[0];
    }

    if (!verification) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired verification code. Please request a new code.' },
        { status: 400 }
      );
    }

    // Extract email from identifier
    const verifiedEmail = verification.identifier.replace('email-code:', '');

    // Update user email verified status in BOTH tables
    // Better Auth's user table (web logins)
    try {
      await prisma.user.update({
        where: { email: verifiedEmail },
        data: {
          emailVerified: true,
          updatedAt: new Date()
        }
      });
      logger.info('User verified in user table', { route: 'api/auth/verify-code', email: verifiedEmail });
    } catch (e) {
      logger.info('User not in user table (Better Auth)', { route: 'api/auth/verify-code', email: verifiedEmail });
    }

    // CLI users table
    try {
      await prisma.users.update({
        where: { email: verifiedEmail },
        data: {
          emailVerified: true,
          updatedAt: new Date()
        }
      });
      logger.info('User verified in users table', { route: 'api/auth/verify-code', email: verifiedEmail });
    } catch (e) {
      logger.info('User not in users table (CLI)', { route: 'api/auth/verify-code', email: verifiedEmail });
    }

    // Delete the verification record
    await prisma.verifications.delete({
      where: { id: verification.id }
    });

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

  const verification = await prisma.verifications.findFirst({
    where: {
      identifier: {
        startsWith: 'email-code:'
      },
      value: hashedCode,
      expires_at: {
        gt: new Date()
      }
    }
  });

  return NextResponse.json({
    success: !!verification,
    valid: !!verification,
    expiresAt: verification?.expires_at || null
  });
}
