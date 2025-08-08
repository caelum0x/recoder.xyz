import { NextRequest, NextResponse } from 'next/server';
import { ServerAuth } from '@/lib/auth/server-auth';
import type { AuthUser, RegisterData } from '@/lib/auth/types';
import bcrypt from 'bcryptjs';

// Mock user database - replace with actual database integration
const mockUsers: Record<string, AuthUser & { password: string }> = {};

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
    if (mockUsers[email.toLowerCase()]) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser: AuthUser & { password: string } = {
      id: Date.now().toString(),
      email: email.toLowerCase(),
      name,
      plan: 'FREE',
      emailVerified: false,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save to mock database
    mockUsers[email.toLowerCase()] = newUser;

    // Create session
    const { password: _, ...userWithoutPassword } = newUser;
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