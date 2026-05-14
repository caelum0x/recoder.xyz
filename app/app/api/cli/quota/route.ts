import { NextRequest, NextResponse } from 'next/server';
import { withCLIAuth } from '@/lib/middleware/cli-auth-middleware';
import { ensureCommercialQuota, formatCommercialQuotaResponse } from '@/lib/commercial-quota';
import { normalizeCommercialPlan } from '@/lib/plan-entitlements';

/**
 * GET /api/cli/quota
 * Get user's quota and usage information
 * Used by CLI to check if user can make requests
 */
export const GET = withCLIAuth(async (request: NextRequest, context) => {
  try {
    const normalizedPlan = normalizeCommercialPlan(context.plan);
    const quota = await ensureCommercialQuota(context.userId, normalizedPlan, 'day');
    const quotaResponse = formatCommercialQuotaResponse(quota, normalizedPlan);

    return NextResponse.json({
      quota: {
        ...quotaResponse.legacy,
        sessionsUsed: quotaResponse.legacy.sessionsUsedToday,
      },
      commercial: quotaResponse.commercial,
      canMakeRequest: quotaResponse.canMakeRequest,
      message: quotaResponse.canMakeRequest
        ? 'Quota available'
        : 'Legacy runtime quota exceeded. Paid plan value now scales with Spaces, connected agents, approvals, retention, and preview capacity.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get quota' },
      { status: 500 }
    );
  }
});
