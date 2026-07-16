import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { CLIAuthService } from '@/lib/services/cli-auth.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/cli/authorize
 * Step 2: User authorizes device code in web browser
 *
 * Request body:
 * {
 *   "user_code": "ABCD-1234",
 *   "action": "approve" | "deny"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "user": { "email": "...", "name": "...", "plan": "..." }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;
    if (!authUser?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    // Get user from database
    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { user_code, action } = body;

    if (!user_code) {
      return NextResponse.json(
        { error: 'Missing user_code' },
        { status: 400 }
      );
    }

    if (!action || !['approve', 'deny'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "deny"' },
        { status: 400 }
      );
    }

    if (action === 'deny') {
      await CLIAuthService.denyDeviceCode(user_code);
      return NextResponse.json({
        success: true,
        message: 'Device authorization denied',
      });
    }

    // Approve the device code
    const result = await CLIAuthService.authorizeDeviceCode(user_code, user.id);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error('Device authorization error:', { error: String(error), route: 'auth/cli/authorize' });
    return NextResponse.json(
      { error: 'Authorization failed' },
      { status: 400 }
    );
  }
}

/**
 * GET /api/auth/cli/authorize?user_code=ABCD-1234
 * Get device code information for display
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const userCode = searchParams.get('user_code');

    if (!userCode) {
      return NextResponse.json(
        { error: 'Missing user_code parameter' },
        { status: 400 }
      );
    }

    const info = await CLIAuthService.getDeviceCodeInfo(userCode);

    if (!info) {
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 404 }
      );
    }

    return NextResponse.json(info, { status: 200 });
  } catch (error) {
    logger.error('Get device code error:', { error: String(error), route: 'auth/cli/authorize' });
    return NextResponse.json(
      { error: 'Failed to get device code info' },
      { status: 500 }
    );
  }
}
