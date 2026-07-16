import { NextRequest, NextResponse } from 'next/server';
import { withCLIAuth, getPlanFeatures } from '@/lib/middleware/cli-auth-middleware';

/**
 * GET /api/cli/user
 * Get authenticated user information and plan details
 * Used by external CLI to check user status
 */
export const GET = withCLIAuth(async (request: NextRequest, context) => {
  const planFeatures = getPlanFeatures(context.plan);

  return NextResponse.json({
    user: {
      id: context.userId,
      email: context.email,
      name: context.name,
      plan: context.plan,
      status: context.status,
      isPremium: context.isPremium,
    },
    plan: {
      ...planFeatures,
      current: context.plan,
    },
    auth: {
      type: context.authType,
      sessionId: context.sessionId,
      keyId: context.keyId,
    },
  });
});
