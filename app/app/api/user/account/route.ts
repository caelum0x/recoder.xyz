import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';

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

    return NextResponse.json({
      success: true,
      data: {
        user: {
          ...user,
          timezone: (preferences?.developerPreferences as any)?.timezone || 'America/New_York',
          language: (preferences?.languagePreferences as any)?.language || 'en'
        }
      }
    });

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

    // If email is changing, we need to verify it
    if (email && email !== user.email) {
      updateData.email = email;
      updateData.emailVerified = false;
      // TODO: Send verification email
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

    return NextResponse.json({
      success: true,
      message: 'Account updated successfully',
      data: { user: updatedUser }
    });

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

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
