/**
 * JWT Token Generation for Backend API
 * Converts Better Auth session to JWT token for backend compatibility
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import * as jwt from 'jsonwebtoken';

const skipJwtValidation =
  process.env.SKIP_ENV_VALIDATION === 'true' ||
  process.env.NEXT_PHASE === 'phase-production-build';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' && !skipJwtValidation) {
      throw new Error('JWT_SECRET or NEXTAUTH_SECRET must be set in production');
    }
    return 'build-jwt-secret-not-for-runtime';
  }
  return secret;
}

export async function GET(request: NextRequest) {
  try {
    const jwtSecret = getJwtSecret();

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

    const token = jwt.sign(payload, jwtSecret, {
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
