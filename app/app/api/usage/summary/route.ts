/**
 * Usage Summary API
 *
 * Lightweight read of the ENFORCED request quota for the signed-in user —
 * the same getQuotaStatus() the AI routes gate on, so the meter in the UI
 * can never drift from what enforcement actually does.
 *
 * Mirrors /api/user/subscription: CORS for cross-subdomain platform surfaces,
 * lenient read rate limit, Bearer-or-session auth via getUserFromToken.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth-helpers';
import { getQuotaStatus } from '@/lib/usage-service';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { addCorsHeaders, handlePreflight } from '@/lib/middleware/cors';
import { logger } from '@/lib/logger';

const usageReadLimiter = rateLimit(rateLimitConfigs.api);

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function GET(request: NextRequest) {
  const cors = (res: Response) => addCorsHeaders(res, request);
  try {
    const rateLimitResponse = await usageReadLimiter(request);
    if (rateLimitResponse) return cors(rateLimitResponse);

    const user = await getUserFromToken(request);
    if (!user) {
      return cors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const quota = await getQuotaStatus(user.id);

    return cors(
      NextResponse.json({
        success: true,
        used: quota.used,
        limit: quota.limit, // -1 = unlimited
        remaining: quota.remaining,
        allowed: quota.allowed,
        upgradeRequired: !!quota.upgradeRequired,
        resetDate: quota.resetDate,
        upgradeUrl: '/billing/upgrade',
      }),
    );
  } catch (error) {
    logger.error('Usage summary error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return cors(
      NextResponse.json({ error: 'Failed to fetch usage summary' }, { status: 500 }),
    );
  }
}
