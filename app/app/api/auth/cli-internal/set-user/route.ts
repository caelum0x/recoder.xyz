import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';

/**
 * POST - Store user info for an auth code (called from cli-callback page)
 * Also syncs user from better-auth to our users table
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, user_id, user_email, user_name, redirect_uri, client_id } = body;

    if (!code || !user_id) {
      return NextResponse.json({
        success: false,
        error: 'missing_parameters'
      }, { status: 400 });
    }

    // Check if user exists in our users table, if not sync from better-auth
    let appUser = await prisma.users.findUnique({
      where: { id: user_id }
    });

    if (!appUser) {
      // Try to find by email
      appUser = await prisma.users.findUnique({
        where: { email: user_email }
      });
    }

    if (!appUser) {
      // Create user in our users table (sync from better-auth)
      appUser = await prisma.users.create({
        data: {
          id: user_id,
          email: user_email || `user-${user_id}@recoder.xyz`,
          name: user_name || 'CLI User',
          emailVerified: true, // They authenticated via OAuth
          subscription: 'free',
          subscriptionPlan: 'free',
          subscriptionStatus: 'active',
          updatedAt: new Date(),
        }
      });
      console.log(`Created new CLI user: ${appUser.email}`);
    }

    // Store auth code in database
    await prisma.authCode.upsert({
      where: { code },
      update: {
        userId: appUser.id,
        used: false,
      },
      create: {
        id: nanoid(),
        code,
        userId: appUser.id,
        clientId: client_id || 'recoder-code',
        redirectUri: redirect_uri,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      }
    });

    // Clean up expired codes
    await prisma.authCode.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'User info stored for auth code',
      user_id: appUser.id
    });

  } catch (error) {
    console.error('Set user error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET - Retrieve user info for an auth code (called during token exchange)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({
      success: false,
      error: 'missing_code'
    }, { status: 400 });
  }

  try {
    const authCode = await prisma.authCode.findUnique({
      where: { code },
      include: { user: true }
    });

    if (!authCode) {
      return NextResponse.json({
        success: false,
        error: 'code_not_found'
      }, { status: 404 });
    }

    if (authCode.used) {
      return NextResponse.json({
        success: false,
        error: 'code_already_used'
      }, { status: 400 });
    }

    if (new Date() > authCode.expiresAt) {
      return NextResponse.json({
        success: false,
        error: 'code_expired'
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      user: {
        user_id: authCode.userId,
        user_email: authCode.user?.email,
        user_name: authCode.user?.name
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}
