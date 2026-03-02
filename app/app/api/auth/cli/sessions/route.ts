import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

import { CLIAuthService } from '@/lib/services/cli-auth.service';
import { prisma } from '@/lib/prisma';
import {
  APP_CLI_SESSION_CONTRACT,
  assertCliSessionActionResponse,
  assertCliSessionErrorResponse,
  assertCliSessionsListResponse,
} from '@/lib/contracts/cli-session-contracts';

/**
 * GET /api/auth/cli/sessions
 * List all CLI sessions for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;
    if (!authUser?.email) {
      const payload = assertCliSessionErrorResponse({
        contract: APP_CLI_SESSION_CONTRACT,
        error: 'Unauthorized',
      });
      return NextResponse.json(
        payload,
        { status: 401 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      const payload = assertCliSessionErrorResponse({
        contract: APP_CLI_SESSION_CONTRACT,
        error: 'User not found',
      });
      return NextResponse.json(
        payload,
        { status: 404 }
      );
    }

    const sessions = await CLIAuthService.listUserSessions(user.id);
    const payload = assertCliSessionsListResponse({
      contract: APP_CLI_SESSION_CONTRACT,
      sessions,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error: any) {
    logger.error('List sessions error:', { error: String(error), route: 'auth/cli/sessions' });
    const payload = assertCliSessionErrorResponse({
      contract: APP_CLI_SESSION_CONTRACT,
      error: 'Failed to list sessions',
    });
    return NextResponse.json(
      payload,
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/cli/sessions/:sessionId
 * Revoke a CLI session
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;
    if (!authUser?.email) {
      const payload = assertCliSessionErrorResponse({
        contract: APP_CLI_SESSION_CONTRACT,
        error: 'Unauthorized',
      });
      return NextResponse.json(
        payload,
        { status: 401 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      const payload = assertCliSessionErrorResponse({
        contract: APP_CLI_SESSION_CONTRACT,
        error: 'User not found',
      });
      return NextResponse.json(
        payload,
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      const payload = assertCliSessionErrorResponse({
        contract: APP_CLI_SESSION_CONTRACT,
        error: 'Missing session_id',
      });
      return NextResponse.json(
        payload,
        { status: 400 }
      );
    }

    const result = await CLIAuthService.revokeSession(sessionId, user.id);
    const payload = assertCliSessionActionResponse({
      contract: APP_CLI_SESSION_CONTRACT,
      ...(typeof result === 'object' && result ? result : {}),
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error: any) {
    logger.error('Revoke session error:', { error: String(error), route: 'auth/cli/sessions' });
    const payload = assertCliSessionErrorResponse({
      contract: APP_CLI_SESSION_CONTRACT,
      error: 'Failed to revoke session',
    });
    return NextResponse.json(
      payload,
      { status: 500 }
    );
  }
}
