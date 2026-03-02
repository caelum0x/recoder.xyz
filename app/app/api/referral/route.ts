/**
 * Referral API Route
 *
 * GET /api/referral
 *   - Returns the authenticated user's referral code and count of referred users.
 *   - If the user has no referral code yet, generates an 8-char alphanumeric code
 *     and persists it on the `users` row.
 *
 * Auth: requires a valid session (Better Auth cookie or JWT Bearer token).
 * Uses the `users` table (CLI auth table) for referral data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random 8-character alphanumeric code. */
function generateReferralCode(): string {
  // 6 random bytes -> 8 base36-ish chars (filtered to alphanumeric)
  const bytes = crypto.randomBytes(6);
  const code = bytes
    .toString('base64url') // URL-safe base64 (A-Z, a-z, 0-9, -, _)
    .replace(/[-_]/g, '')  // strip non-alphanumeric chars
    .substring(0, 8)
    .toUpperCase();
  // In the unlikely event filtering leaves < 8 chars, pad with hex
  if (code.length < 8) {
    return (code + crypto.randomBytes(4).toString('hex')).substring(0, 8).toUpperCase();
  }
  return code;
}

// ---------------------------------------------------------------------------
// GET /api/referral
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const authUser = authResult.user!;

    // Look up the users table record by email (session user ID may be from
    // Better Auth, not from the CLI `users` table).
    let user = await prisma.users.findUnique({
      where: { email: authUser.email },
      select: {
        id: true,
        referralCode: true,
        referredByCode: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User record not found' },
        { status: 404 }
      );
    }

    // If the user doesn't have a referral code yet, generate one.
    // Retry up to 3 times in case of a (very unlikely) unique constraint collision.
    if (!user.referralCode) {
      let attempts = 0;
      let saved = false;

      while (!saved && attempts < 3) {
        attempts++;
        const candidate = generateReferralCode();
        try {
          user = await prisma.users.update({
            where: { id: user.id },
            data: { referralCode: candidate },
            select: {
              id: true,
              referralCode: true,
              referredByCode: true,
            },
          });
          saved = true;
        } catch (err: any) {
          // P2002 = unique constraint violation (another user already has this code)
          if (err?.code === 'P2002') {
            console.warn(`Referral code collision on attempt ${attempts}: ${candidate}`);
            continue;
          }
          throw err;
        }
      }

      if (!saved) {
        return NextResponse.json(
          { success: false, error: 'Failed to generate a unique referral code. Please try again.' },
          { status: 500 }
        );
      }
    }

    // Count how many users were referred by this user's code
    const referredCount = await prisma.users.count({
      where: { referredByCode: user.referralCode! },
    });

    return NextResponse.json({
      success: true,
      referralCode: user.referralCode,
      referredByCode: user.referredByCode ?? null,
      referredCount,
    });
  } catch (error: any) {
    console.error('Referral API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve referral information' },
      { status: 500 }
    );
  }
}
