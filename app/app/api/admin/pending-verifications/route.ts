/**
 * Pending Verifications API Route (Admin/Testing)
 * Lists pending email verifications for testing purposes
 *
 * Usage:
 * GET /api/admin/pending-verifications?email=test@example.com
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { ensureAdminAccess } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    const access = await ensureAdminAccess(request);
    if ('response' in access) {
      return access.response;
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email query parameter is required' },
        { status: 400 }
      );
    }

    // Find all pending verifications for this email
    const verifications = await prisma.verifications.findMany({
      where: {
        identifier: {
          contains: email
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    // Check user status in both tables
    const prismaAny = prisma as unknown as {
      user?: {
        findUnique: (args: {
          where: { email: string };
          select: {
            id: true;
            email: true;
            name: true;
            emailVerified: true;
            createdAt: true;
          };
        }) => Promise<{
          id: string;
          email: string;
          name: string;
          emailVerified: boolean;
          createdAt: Date;
        } | null>;
      };
    };

    const webUser = prismaAny.user?.findUnique
      ? await prismaAny.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            emailVerified: true,
            createdAt: true
          }
        })
      : null;

    const cliUser = await prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true
      }
    });

    const pendingVerifications = verifications.map(v => ({
      id: v.id,
      type: v.identifier.split(':')[0],
      identifier: v.identifier,
      expiresAt: v.expires_at,
      createdAt: v.created_at,
      isExpired: new Date(v.expires_at) < new Date(),
      // Don't expose the actual hash value for security
      hasValue: !!v.value,
    }));

    return NextResponse.json({
      success: true,
      email,
      users: {
        webUser: webUser ? {
          ...webUser,
          table: 'user (Better Auth)'
        } : null,
        cliUser: cliUser ? {
          ...cliUser,
          table: 'users (CLI)'
        } : null,
      },
      pendingVerifications,
      count: pendingVerifications.length,
      summary: {
        hasActiveVerification: pendingVerifications.some(v => !v.isExpired),
        isVerified: webUser?.emailVerified || cliUser?.emailVerified || false,
      }
    });

  } catch (error) {
    console.error('Pending verifications error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE endpoint to clean up expired verifications
export async function DELETE(request: NextRequest) {
  try {
    const access = await ensureAdminAccess(request);
    if ('response' in access) {
      return access.response;
    }

    // Delete all expired verifications
    const result = await prisma.verifications.deleteMany({
      where: {
        expires_at: {
          lt: new Date()
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} expired verifications`,
      deletedCount: result.count
    });

  } catch (error) {
    console.error('Delete verifications error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST endpoint to seed deterministic verification records for smoke tests
// Body:
// {
//   "email": "test@example.com",
//   "mode": "email-code" | "password-reset"
// }
export async function POST(request: NextRequest) {
  try {
    const access = await ensureAdminAccess(request);
    if ('response' in access) {
      return access.response;
    }

    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const mode = body?.mode === 'password-reset' ? 'password-reset' : 'email-code';

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const rawValue =
      mode === 'email-code'
        ? crypto.randomInt(100000, 999999).toString()
        : crypto.randomBytes(32).toString('hex');
    const hashedValue = crypto.createHash('sha256').update(rawValue).digest('hex');
    const identifier =
      mode === 'email-code'
        ? `email-code:${email}`
        : `password-reset:${email}`;

    await prisma.verifications.deleteMany({
      where: { identifier },
    });

    await prisma.verifications.create({
      data: {
        id: crypto.randomUUID(),
        identifier,
        value: hashedValue,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      email,
      mode,
      identifier,
      value: rawValue,
      expiresAt,
    });
  } catch (error) {
    console.error('Create verification seed error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
