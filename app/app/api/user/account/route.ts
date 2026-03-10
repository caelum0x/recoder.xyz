import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';
import { sendVerificationEmailWithCode } from '@/lib/email';
import {
  assertAccountDeleteResponse,
  assertAccountPutResponse,
} from '@/lib/contracts/account-contracts';
import nodeCrypto from 'crypto';
import {
  createVerificationRecord,
  deleteVerificationsByIdentifierPrefixes,
} from '@/lib/auth/verification-store';
import { logger } from '@/lib/logger';

function getPreferenceValue(
  value: unknown,
  key: 'timezone' | 'language'
): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const entry = record[key];
  return typeof entry === 'string' ? entry : undefined;
}

type SafeAccountUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  organization: string | null;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: boolean;
  role: string | null;
  isActive: boolean;
  twoFactorEnabled: boolean;
};

function toSafeAccountUser(user: {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  organization?: string | null;
  createdAt: Date;
  updatedAt: Date;
  emailVerified?: boolean | null;
  role?: string | null;
  isActive?: boolean | null;
  twoFactorEnabled?: boolean | null;
}): SafeAccountUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    organization: user.organization ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    emailVerified: Boolean(user.emailVerified),
    role: user.role ?? 'user',
    isActive: user.isActive ?? true,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appUser = await ensureAppUserFromAuthUser(authUser);

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prefer a fresh read for dashboard/settings consistency, but never fail
    // the entire endpoint if optional fields or schema drift cause a read error.
    let resolvedUser: typeof appUser = appUser;
    try {
      const user = await prisma.users.findUnique({
        where: { email: authUser.email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          organization: true,
          createdAt: true,
          updatedAt: true,
          emailVerified: true,
          role: true,
          isActive: true,
          twoFactorEnabled: true,
        }
      });

      if (user) {
        resolvedUser = {
          ...appUser,
          ...user,
        };
      }
    } catch (userReadError) {
      logger.warn('[Account] primary user read failed, using appUser fallback:', { detail: userReadError instanceof Error ? userReadError.message : String(userReadError) });
    }

    if (!resolvedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let preferences: { developerPreferences?: unknown; languagePreferences?: unknown } | null = null;
    try {
      preferences = await prisma.user_preferences.findUnique({
        where: { userId: resolvedUser.id }
      });
    } catch (preferencesError) {
      logger.warn('[Account] user_preferences lookup failed, using defaults:', { detail: preferencesError instanceof Error ? preferencesError.message : String(preferencesError) });
    }

    const safeUser = toSafeAccountUser(resolvedUser);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          ...safeUser,
          timezone: getPreferenceValue(preferences?.developerPreferences, 'timezone') || 'America/New_York',
          language: getPreferenceValue(preferences?.languagePreferences, 'language') || 'en'
        }
      }
    });

  } catch (error) {
    logger.error('Get account error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to fetch account data' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, timezone, language, organization } = body;

    // Validate input lengths
    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      return NextResponse.json({ error: 'Name must be a string of at most 100 characters' }, { status: 400 });
    }
    if (organization !== undefined && (typeof organization !== 'string' || organization.length > 200)) {
      return NextResponse.json({ error: 'Organization must be a string of at most 200 characters' }, { status: 400 });
    }
    if (timezone !== undefined && (typeof timezone !== 'string' || timezone.length > 50)) {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
    }
    if (language !== undefined && (typeof language !== 'string' || language.length > 10)) {
      return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
    }

    const user = await ensureAppUserFromAuthUser(authUser);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user basic info
    const updateData: { name?: string; organization?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (organization !== undefined) updateData.organization = organization;

    // Email change requires verification on the new address
    if (email && email !== user.email) {
      // Validate email format
      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }

      // Check if new email is already taken
      const existingUser = await prisma.users.findUnique({
        where: { email }
      });
      if (existingUser) {
        return NextResponse.json(
          { error: 'This email address is already in use' },
          { status: 409 }
        );
      }

      // Also check Better Auth user table when available.
      const prismaAny = prisma as unknown as {
        user?: {
          findUnique: (args: { where: { email: string } }) => Promise<unknown>;
        };
      };
      if (prismaAny.user?.findUnique) {
        const existingWebUser = await prismaAny.user.findUnique({
          where: { email }
        });
        if (existingWebUser) {
          return NextResponse.json(
            { error: 'This email address is already in use' },
            { status: 409 }
          );
        }
      }

      // Clean up any previous pending email change verifications for this user
      await deleteVerificationsByIdentifierPrefixes([
        `email-change:${user.id}:`,
        `email-change-token:${user.id}:`,
      ]);

      // Generate 6-digit verification code
      const verificationCode = nodeCrypto.randomInt(100000, 999999).toString();
      // Generate link-based token
      const verificationToken = nodeCrypto.randomBytes(32).toString('hex');

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await createVerificationRecord(
        `email-change:${user.id}:${email}`,
        verificationCode,
        expiresAt
      );
      await createVerificationRecord(
        `email-change-token:${user.id}:${email}`,
        verificationToken,
        expiresAt
      );

      // Build verification URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
      const verificationUrl = `${baseUrl}/api/user/account/verify-email-change?token=${verificationToken}`;

      // Send verification email to the NEW email address
      const emailResult = await sendVerificationEmailWithCode(email, verificationCode, verificationUrl);

      if (!emailResult.success) {
        logger.error('[Account] Failed to send email change verification:', { error: emailResult.error instanceof Error ? emailResult.error.message : String(emailResult.error) });
        return NextResponse.json(
          { error: 'Failed to send verification email. Please try again.' },
          { status: 500 }
        );
      }

      // Log audit event
      await prisma.audit_logs.create({
        data: {
          id: nodeCrypto.randomUUID(),
          userId: user.id,
          action: 'email_change_requested',
          resource: 'account',
          resourceId: user.id,
          metadata: { currentEmail: user.email, newEmail: email },
        }
      });

      return NextResponse.json(assertAccountPutResponse({
        success: true,
        message: 'A verification code has been sent to your new email address. Please check your inbox and verify to complete the change.',
        emailChangePending: true,
        newEmail: email,
      }));
    }

    const updatedUser = await prisma.users.update({
      where: { id: user.id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      }
    });

    // Update preferences
    if (timezone || language) {
    await prisma.user_preferences.upsert({
        where: { userId: user.id },
        create: {
          id: nodeCrypto.randomUUID(),
          userId: user.id,
          developerPreferences: { timezone: timezone || 'America/New_York' },
          languagePreferences: { language: language || 'en' },
          updatedAt: new Date(),
        },
        update: {
          developerPreferences: timezone ? { timezone } : undefined,
          languagePreferences: language ? { language } : undefined,
          updatedAt: new Date(),
        }
      });
    }

    // Optional audit trail; don't fail account updates if audit table is unavailable.
    try {
      await prisma.audit_logs.create({
        data: {
          id: nodeCrypto.randomUUID(),
          userId: user.id,
          action: 'updated',
          resource: 'account',
          resourceId: user.id,
          metadata: { fields: Object.keys(updateData) },
        }
      });
    } catch (auditError) {
      logger.warn('[Account] audit log write failed:', { detail: auditError instanceof Error ? auditError.message : String(auditError) });
    }

    return NextResponse.json(assertAccountPutResponse({
      success: true,
      message: 'Account updated successfully',
      data: { user: updatedUser }
    }));

  } catch (error) {
    logger.error('Update account error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to update account' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await ensureAppUserFromAuthUser(authUser);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Optional audit trail; don't fail deletion if audit table is unavailable.
    try {
      await prisma.audit_logs.create({
        data: {
          id: nodeCrypto.randomUUID(),
          userId: user.id,
          action: 'deleted',
          resource: 'account',
          resourceId: user.id,
          metadata: { email: user.email },
        }
      });
    } catch (auditError) {
      logger.warn('[Account] audit log write failed during delete:', { detail: auditError instanceof Error ? auditError.message : String(auditError) });
    }

    // Delete user (cascade will handle related records)
    await prisma.users.delete({
      where: { id: user.id }
    });

    return NextResponse.json(assertAccountDeleteResponse({
      success: true,
      message: 'Account deleted successfully'
    }));

  } catch (error) {
    logger.error('Delete account error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
