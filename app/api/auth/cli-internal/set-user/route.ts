import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

/**
 * Internal API for mapping authenticated users to CLI auth codes
 * Used by the authentication flow to associate users with pending CLI requests
 */
export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { authCode } = await request.json();

    if (!authCode) {
      return NextResponse.json(
        { success: false, error: 'Auth code required' },
        { status: 400 }
      );
    }

    // Find the user in database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Find and update the auth code
    const authCodeRecord = await prisma.authCode.findUnique({
      where: { code: authCode }
    });

    if (!authCodeRecord) {
      return NextResponse.json(
        { success: false, error: 'Invalid auth code' },
        { status: 400 }
      );
    }

    if (authCodeRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Auth code expired' },
        { status: 400 }
      );
    }

    if (authCodeRecord.used) {
      return NextResponse.json(
        { success: false, error: 'Auth code already used' },
        { status: 400 }
      );
    }

    // Associate user with auth code (but don't mark as used yet)
    await prisma.authCode.update({
      where: { code: authCode },
      data: { userId: user.id }
    });

    return NextResponse.json({
      success: true,
      message: 'User associated with auth code'
    });

  } catch (error) {
    console.error('CLI internal set-user error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
