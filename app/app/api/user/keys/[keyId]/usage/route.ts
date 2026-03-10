import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { PlatformApiKeyService } from '@/lib/services/platform-api-key.service';
import { logger } from '@/lib/logger';

/**
 * GET /api/user/keys/[keyId]/usage
 * Get usage statistics for a specific API key
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ keyId: string }> }
) {
  try {
    // In Next.js 15, params is a Promise that must be awaited
    const params = await props.params;

    const authResult = await requireAuth(req);
    if (authResult.error) return authResult.response;
    const user = authResult.user;
    const appUser = await ensureAppUserFromAuthUser(user);

    if (!appUser?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { keyId } = params;

    if (!keyId) {
      return NextResponse.json(
        { error: 'keyId is required' },
        { status: 400 }
      );
    }

    const stats = await PlatformApiKeyService.getKeyUsageStats(keyId, appUser.id);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error('Error fetching key usage stats:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to fetch usage statistics' },
      { status: 500 }
    );
  }
}
