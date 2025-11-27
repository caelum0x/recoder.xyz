/**
 * JWT Token Generation for Backend API
 * Converts Better Auth session to JWT token for backend compatibility
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret-change-in-production';

export async function GET(request: NextRequest) {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Generate JWT token compatible with backend
    const payload = {
      userId: session.user.id,
      email: session.user.email,
      role: 'user', // Default role, can be customized
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: '15m', // Match backend token expiry
    });

    return NextResponse.json({
      success: true,
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: '15m',
    });
  } catch (error: any) {
    console.error('Token generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate token' },
      { status: 500 }
    );
  }
}
