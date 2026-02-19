import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import {
  APP_CLI_SESSION_CONTRACT,
  assertCliSessionActionResponse,
  assertCliSessionErrorResponse,
} from '@/lib/contracts/cli-session-contracts';
import { logger } from '@/lib/logger';


const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * DELETE /api/cli/sessions/all
 * Revoke all CLI sessions for the authenticated user
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user, session } = authResult;

    if (!user?.email) {
      const payload = assertCliSessionErrorResponse({
        contract: APP_CLI_SESSION_CONTRACT,
        error: 'Unauthorized',
        message: 'Please sign in',
      });
      return NextResponse.json(
        payload,
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/auth/cli/sessions/all`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${(session as any)?.accessToken || ''}`,
        'Content-Type': 'application/json',
        'X-User-Email': user.email,
        'X-User-ID': user.id || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      logger.error('Failed to revoke all CLI sessions', { route: 'api/cli/sessions/all', error: JSON.stringify(error) });
      const payload = assertCliSessionErrorResponse({
        contract: APP_CLI_SESSION_CONTRACT,
        error: 'Failed to revoke all CLI sessions',
        message: 'Backend request failed',
      });
      return NextResponse.json(
        payload,
        { status: response.status }
      );
    }

    const data = await response.json();
    const payload = assertCliSessionActionResponse({
      contract: APP_CLI_SESSION_CONTRACT,
      ...(typeof data === 'object' && data ? data : {}),
    });

    return NextResponse.json(payload);

  } catch (error) {
    logger.error('CLI sessions DELETE all error', { route: 'api/cli/sessions/all', error: error instanceof Error ? error.message : String(error) });
    const payload = assertCliSessionErrorResponse({
      contract: APP_CLI_SESSION_CONTRACT,
      error: 'Internal server error',
      message: 'Failed to revoke all CLI sessions',
    });
    return NextResponse.json(
      payload,
      { status: 500 }
    );
  }
}
