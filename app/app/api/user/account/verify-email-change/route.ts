/**
 * Email Change Verification Route
 * Confirms pending email changes via token (link) or code
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

/**
 * GET /api/user/account/verify-email-change?token=...
 * Link-based email change confirmation (clicked from email)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
      return NextResponse.redirect(new URL('/settings/account?error=invalid_token', baseUrl));
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find the token-based verification
    const verifications = await prisma.verifications.findMany({
      where: {
        value: hashedToken,
        expires_at: { gt: new Date() },
      }
    });

    const verification = verifications.find(v =>
      v.identifier.startsWith('email-change-token:')
    );

    if (!verification) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
      return NextResponse.redirect(new URL('/settings/account?error=expired_token', baseUrl));
    }

    // Parse identifier: email-change-token:{userId}:{newEmail}
    const parts = verification.identifier.replace('email-change-token:', '').split(':');
    const userId = parts[0];
    const newEmail = parts.slice(1).join(':'); // email may contain colons

    // Execute the email change
    const result = await executeEmailChange(userId, newEmail);

    if (!result.success) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
      return NextResponse.redirect(new URL(`/settings/account?error=${result.error}`, baseUrl));
    }

    // Clean up all related verifications
    await prisma.verifications.deleteMany({
      where: {
        identifier: {
          in: [
            `email-change:${userId}:${newEmail}`,
            `email-change-token:${userId}:${newEmail}`,
          ]
        }
      }
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
    return NextResponse.redirect(new URL('/settings/account?emailChanged=true', baseUrl));

  } catch (error) {
    console.error('[verify-email-change] GET error:', error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
    return NextResponse.redirect(new URL('/settings/account?error=verification_failed', baseUrl));
  }
}

/**
 * POST /api/user/account/verify-email-change
 * Code-based email change confirmation (user enters 6-digit code)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json(
        { error: 'A valid 6-digit verification code is required' },
        { status: 400 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

    // Find matching code verification for this user
    const verifications = await prisma.verifications.findMany({
      where: {
        value: hashedCode,
        expires_at: { gt: new Date() },
      }
    });

    const verification = verifications.find(v =>
      v.identifier.startsWith(`email-change:${user.id}:`)
    );

    if (!verification) {
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    // Parse new email from identifier
    const newEmail = verification.identifier.replace(`email-change:${user.id}:`, '');

    // Execute the email change
    const result = await executeEmailChange(user.id, newEmail);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error === 'email_taken' ? 'This email address is already in use' : 'Failed to change email' },
        { status: result.error === 'email_taken' ? 409 : 500 }
      );
    }

    // Clean up all related verifications
    await prisma.verifications.deleteMany({
      where: {
        identifier: {
          in: [
            `email-change:${user.id}:${newEmail}`,
            `email-change-token:${user.id}:${newEmail}`,
          ]
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Email address updated successfully',
      newEmail,
    });

  } catch (error) {
    console.error('[verify-email-change] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to verify email change' },
      { status: 500 }
    );
  }
}

/**
 * Executes the actual email change across both user tables
 */
async function executeEmailChange(userId: string, newEmail: string): Promise<{ success: boolean; error?: string }> {
  // Double-check the email isn't taken (race condition guard)
  const existingUser = await prisma.users.findUnique({ where: { email: newEmail } });
  if (existingUser) {
    return { success: false, error: 'email_taken' };
  }

  try {
    const existingWebUser = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existingWebUser) {
      return { success: false, error: 'email_taken' };
    }
  } catch {
    // user table may not exist
  }

  // Get current user for old email
  const currentUser = await prisma.users.findUnique({ where: { id: userId } });
  if (!currentUser) {
    return { success: false, error: 'user_not_found' };
  }

  const oldEmail = currentUser.email;

  // Update CLI users table
  await prisma.users.update({
    where: { id: userId },
    data: {
      email: newEmail,
      emailVerified: true, // verified via code/link
      updatedAt: new Date(),
    }
  });

  // Update Better Auth user table if the user exists there
  try {
    await prisma.user.update({
      where: { email: oldEmail },
      data: {
        email: newEmail,
        emailVerified: true,
        updatedAt: new Date(),
      }
    });
  } catch {
    // User may not exist in Better Auth table
  }

  // Update accounts table if email is used there
  try {
    await prisma.account.updateMany({
      where: { userId },
      data: { updatedAt: new Date() }
    });
  } catch {
    // account table may not exist or user has no accounts
  }

  // Log audit event
  await prisma.audit_logs.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      action: 'email_changed',
      resource: 'account',
      resourceId: userId,
      metadata: { oldEmail, newEmail },
    }
  });

  console.log(`[Account] Email changed: ${oldEmail} -> ${newEmail}`);

  return { success: true };
}
