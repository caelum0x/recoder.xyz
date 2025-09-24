import { NextRequest, NextResponse } from 'next/server';
import { ServerAuth } from '@/lib/auth/server-auth';
import type { AuthUser, LoginCredentials } from '@/lib/auth/types';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';


export async function POST(request: NextRequest) {
  try {
    const body: LoginCredentials = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        password: true,
        twoFactorEnabled: true,
        totpSecret: true,
        backupCodes: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password || '');
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      // Create a temporary session token for 2FA verification
      const tempSessionToken = await ServerAuth.createSessionToken({
        id: user.id,
        email: user.email,
        name: user.name || '',
        emailVerified: Boolean(user.emailVerified),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        requires2FA: true
      });

      return NextResponse.json({
        requires2FA: true,
        tempSessionToken,
        expires: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
      });
    }

    // Create full session for user without 2FA
    const { password: _, ...userWithoutPassword } = user;
    const sessionToken = await ServerAuth.createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name || '',
      emailVerified: Boolean(user.emailVerified),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    });

    // Create response with session
    const response = NextResponse.json({
      user: userWithoutPassword,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      sessionToken
    });

    // Set session cookie
    ServerAuth.setSessionCookie(response, sessionToken);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}