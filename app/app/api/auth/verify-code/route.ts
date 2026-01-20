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
      console.log(`[verify-code] User verified in 'user' table: ${verifiedEmail}`);
    } catch (e) {
      console.log(`[verify-code] User not in 'user' table (Better Auth): ${verifiedEmail}`);
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
      console.log(`[verify-code] User verified in 'users' table: ${verifiedEmail}`);
    } catch (e) {
      console.log(`[verify-code] User not in 'users' table (CLI): ${verifiedEmail}`);
    }

    // Delete the verification record
    await prisma.verifications.delete({
      where: { id: verification.id }
    });

    console.log(`✅ Email verified via code for ${verifiedEmail}`);

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully!',
      email: verifiedEmail
    });

  } catch (error: any) {
    console.error('Code verification error:', error);
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
