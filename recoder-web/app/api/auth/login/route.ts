import { NextRequest, NextResponse } from 'next/server';
import { ServerAuth } from '@/lib/auth/server-auth';
import type { AuthUser, LoginCredentials } from '@/lib/auth/types';
import bcrypt from 'bcryptjs';

// Mock user database - replace with actual database integration
const mockUsers: Record<string, AuthUser & { password: string }> = {
  'admin@recoder.xyz': {
    id: '1',
    email: 'admin@recoder.xyz',
    name: 'Admin User',
    plan: 'ENTERPRISE',
    emailVerified: true,
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  'user@recoder.xyz': {
    id: '2',
    email: 'user@recoder.xyz',
    name: 'Test User',
    plan: 'PRO',
    emailVerified: true,
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  }
};

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

    // Find user in mock database
    const user = mockUsers[email.toLowerCase()];
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Create session
    const { password: _, ...userWithoutPassword } = user;
    const sessionToken = await ServerAuth.createSessionToken(userWithoutPassword);

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