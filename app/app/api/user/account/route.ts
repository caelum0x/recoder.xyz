import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';
import { sendVerificationEmailWithCode } from '@/lib/email';
import {
  assertAccountDeleteResponse,
  assertAccountGetResponse,
  assertAccountPutResponse,
} from '@/lib/contracts/account-contracts';
import nodeCrypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        organization: true,
        createdAt: true,
        emailVerified: true,
        subscription: true,
        role: true,
        isActive: true,
        twoFactorEnabled: true,
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user preferences if they exist
    const preferences = await prisma.user_preferences.findUnique({
      where: { userId: user.id }
    });

    return NextResponse.json(assertAccountGetResponse({
      success: true,
      data: {
        user: {
          ...user,
          timezone: (preferences?.developerPreferences as any)?.timezone || 'America/New_York',
          language: (preferences?.languagePreferences as any)?.language || 'en'
        }
      }
    }));

  } catch (error) {
    console.error('Get account error:', error);
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

    const user = await prisma.users.findUnique({
      where: { email: authUser.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user basic info
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (organization !== undefined) updateData.organization = organization;

    // Email change requires verification on the new address
    if (email && email !== user.email) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
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

      // Also check Better Auth user table
      try {
        const existingWebUser = await prisma.user.findUnique({
          where: { email }
        });
        if (existingWebUser) {
          return NextResponse.json(
            { error: 'This email address is already in use' },
            { status: 409 }
          );
        }
      } catch {
        // user table may not exist in all environments
      }

      // Clean up any previous pending email change verifications for this user
      await prisma.verifications.deleteMany({
        where: {
          identifier: { startsWith: `email-change:${user.id}:` }
        }
      });

      // Generate 6-digit verification code
      const verificationCode = nodeCrypto.randomInt(100000, 999999).toString();
      const hashedCode = nodeCrypto.createHash('sha256').update(verificationCode).digest('hex');

      // Generate link-based token
      const verificationToken = nodeCrypto.randomBytes(32).toString('hex');
      const hashedToken = nodeCrypto.createHash('sha256').update(verificationToken).digest('hex');

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store code verification (identifier encodes userId + newEmail)
      await prisma.verifications.create({
        data: {
          id: nodeCrypto.randomUUID(),
          identifier: `email-change:${user.id}:${email}`,
          value: hashedCode,
          expires_at: expiresAt,
          created_at: new Date(),
          updated_at: new Date(),
        }
      });

      // Store token verification
      await prisma.verifications.create({
        data: {
          id: nodeCrypto.randomUUID(),
          identifier: `email-change-token:${user.id}:${email}`,
          value: hashedToken,
          expires_at: expiresAt,
          created_at: new Date(),
          updated_at: new Date(),
        }
      });

      // Build verification URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://recoder.xyz';
      const verificationUrl = `${baseUrl}/api/user/account/verify-email-change?token=${verificationToken}`;

      // Send verification email to the NEW email address
      const emailResult = await sendVerificationEmailWithCode(email, verificationCode, verificationUrl);

      if (!emailResult.success) {
        console.error('[Account] Failed to send email change verification:', emailResult.error);
        return NextResponse.json(
          { error: 'Failed to send verification email. Please try again.' },
          { status: 500 }
        );
      }

      console.log(`[Account] Email change verification sent: ${user.email} -> ${email}`);

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
          id: crypto.randomUUID(),
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

    // Log audit event
    await prisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'updated',
        resource: 'account',
        resourceId: user.id,
        metadata: { fields: Object.keys(updateData) },
      }
    });

    return NextResponse.json(assertAccountPutResponse({
      success: true,
      message: 'Account updated successfully',
      data: { user: updatedUser }
    }));

  } catch (error) {
    console.error('Update account error:', error);
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

    const user = await prisma.users.findUnique({
      where: { email: authUser.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Log audit event before deletion
    await prisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'deleted',
        resource: 'account',
        resourceId: user.id,
        metadata: { email: user.email },
      }
    });

    // Delete user (cascade will handle related records)
    await prisma.users.delete({
      where: { id: user.id }
    });

    return NextResponse.json(assertAccountDeleteResponse({
      success: true,
      message: 'Account deleted successfully'
    }));

  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
