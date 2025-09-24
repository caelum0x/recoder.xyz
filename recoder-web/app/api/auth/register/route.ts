import { NextRequest, NextResponse } from 'next/server';
import { ServerAuth } from '@/lib/auth/server-auth';
import type { AuthUser, RegisterData } from '@/lib/auth/types';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body: RegisterData = await request.json();
    const { email, password, name } = body;

    // Validate input
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user in database
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        password: hashedPassword,
        emailVerified: null
      },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Create session
    const userWithoutPassword = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name || '',
      emailVerified: Boolean(newUser.emailVerified),
      createdAt: newUser.createdAt.toISOString(),
      updatedAt: newUser.updatedAt.toISOString()
    };
    const sessionToken = await ServerAuth.createSessionToken(userWithoutPassword);

    // Create response with session
    const response = NextResponse.json({
      user: userWithoutPassword,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      sessionToken
    });

    // Set session cookie
    ServerAuth.setSessionCookie(response, sessionToken);

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}