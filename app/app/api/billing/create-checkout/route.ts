/**
 * Create Checkout Session API
 *
 * Owner decision 2026-10-27: Recoder's hosted paid tiers (Pro/Team/Enterprise
 * via Dodo/Paddle/Creem) are retired — the product is completely free. This
 * route now always fails closed to a "free, no checkout needed" response
 * instead of creating a real Dodo/Paddle checkout session, so nothing can
 * charge a user even if an older client still calls it. The real
 * provider-integration logic (Dodo/Paddle/Creem) that used to live here was
 * removed; see git history (pre-2026-10-27) if hosted paid tiers are ever
 * reintroduced. The entitlement gate (`lib/entitlements.ts`) already grants
 * every user full/top-tier features regardless of this route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

const billingRateLimiter = rateLimit(rateLimitConfigs.billing);

export async function POST(request: NextRequest) {
  const rateLimitResponse = await billingRateLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  const authResult = await requireAuth();
  if (authResult.error) return authResult.response;
  const { user } = authResult;

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    {
      success: false,
      free: true,
      message: 'Recoder is free — every feature is already unlocked, no checkout needed.',
    },
    { status: 200 }
  );
}
