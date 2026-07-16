/**
 * CLI Token Validation
 * GET /api/auth/cli/validate
 *
 * Validates CLI access token and returns user info
 */

import { NextRequest, NextResponse } from 'next/server';
import { CLIAuthService } from '@/lib/services/cli-auth.service';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const result = await CLIAuthService.validateAccessToken(token);

    return NextResponse.json({
      valid: true,
      user: {
        id: result.userId,
        email: result.email,
        name: result.name,
        plan: result.plan,
        status: result.status,
      },
      sessionId: result.sessionId,
    });
  } catch (error) {
    logger.error('Token validation error:', { error: String(error), route: 'auth/cli/validate' });
    return NextResponse.json(
      { valid: false, error: 'Invalid token' },
      { status: 401 }
    );
  }
}
