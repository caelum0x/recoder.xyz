// User subscription management endpoint
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getUserFromToken } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';
import { userManager } from '@/lib/user-management';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { addCorsHeaders, handlePreflight } from '@/lib/middleware/cors';
import { logger } from '@/lib/logger';

// GET is read-only, use lenient 'api' config (60/min) instead of strict
// 'billing' (5/min) to avoid rate-limiting cross-domain subscription badge polls
const subscriptionReadLimiter = rateLimit(rateLimitConfigs.api);
const billingRateLimiter = rateLimit(rateLimitConfigs.billing);

type PlanType = 'free' | 'pro' | 'enterprise';

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function GET(request: NextRequest) {
  const cors = (res: Response) => addCorsHeaders(res, request);
  try {
    const rateLimitResponse = await subscriptionReadLimiter(request);
    if (rateLimitResponse) return cors(rateLimitResponse);

    const user = await getUserFromToken(request);

    if (!user) {
      return cors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    // Get user with subscription info
    const userWithInfo = await prisma.users.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        hasOwnApiKey: true,
        createdAt: true
      }
    });

    if (!userWithInfo) {
      return cors(NextResponse.json({ error: 'User not found' }, { status: 404 }));
    }

    return cors(NextResponse.json({
      success: true,
      plan: userWithInfo.subscriptionPlan,
      subscription_status: userWithInfo.subscriptionStatus,
      subscription_ends_at: null,
      available_plans: [
        {
          name: 'FREE',
          display_name: 'Free',
          price: 0,
          features: [
            '50 CLI requests/month',
            '3 web projects',
            '100 chat messages/day',
            '200 extension suggestions/day',
            '100MB storage'
          ]
        },
        {
          name: 'PRO',
          display_name: 'Pro',
          price: 20,
          features: [
            '1,000 CLI requests/month',
            '20 web projects',
            '1,000 chat messages/day',
            '2,000 extension suggestions/day',
            '1GB storage',
            'Priority support'
          ]
        },
        {
          name: 'ENTERPRISE',
          display_name: 'Enterprise',
          price: 99,
          features: [
            'Unlimited CLI requests',
            'Unlimited web projects',
            'Unlimited chat messages',
            'Unlimited extension suggestions',
            '10GB storage',
            '24/7 priority support',
            'Custom integrations'
          ]
        }
      ]
    }));
  } catch (error) {
    logger.error('Subscription GET error', { route: 'api/user/subscription', error: error instanceof Error ? error.message : String(error) });
    return cors(NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    ));
  }
}

export async function PUT(request: NextRequest) {
  const cors = (res: Response) => addCorsHeaders(res, request);
  try {
    const rateLimitResponse = await billingRateLimiter(request);
    if (rateLimitResponse) return cors(rateLimitResponse);

    const authResult = await requireAuth(request);
    if (authResult.error) return cors(authResult.response);
    const { user } = authResult;
    
    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { plan } = await request.json();
    
    if (!['FREE', 'PRO', 'ENTERPRISE'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan type' },
        { status: 400 }
      );
    }

    // Downgrade to FREE is allowed without payment
    if (plan === 'FREE') {
      const success = await userManager.changePlan(user.id, plan as PlanType);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to change plan' },
          { status: 500 }
        );
      }
      const profile = await userManager.getUserProfile(user.id);
      return NextResponse.json({
        plan: profile?.subscription_plan,
        subscription_status: profile?.subscription_status,
        changed_at: new Date().toISOString(),
        message: 'Downgraded to Free plan',
      });
    }

    // Paid plan upgrades require going through the checkout flow
    // Check if user already has an active subscription they can upgrade
    const existingSub = await prisma.subscriptions.findFirst({
      where: { userId: user.id, status: 'active' },
    });

    if (existingSub && existingSub.provider === 'dodo' && existingSub.providerId) {
      // Upgrade via Dodo plan change (prorated)
      const { DodoPaymentsService } = await import('@/lib/services/dodopayments.service');
      const planProductMap: Record<string, string> = {
        PRO: process.env.DODO_PRODUCT_PRO || 'prod_pro',
        ENTERPRISE: process.env.DODO_PRODUCT_ENTERPRISE || 'prod_enterprise',
      };
      const productId = planProductMap[plan];
      if (!productId) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
      }

      await DodoPaymentsService.changePlan(
        existingSub.id,
        productId,
        'prorated_immediately'
      );

      return NextResponse.json({
        plan,
        subscription_status: 'active',
        changed_at: new Date().toISOString(),
        message: `Plan change to ${plan} initiated. Billing will be prorated.`,
      });
    }

    // No existing subscription — redirect to checkout
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
    return NextResponse.json({
      requiresCheckout: true,
      checkoutUrl: `${baseUrl}/billing/checkout?plan=${plan.toLowerCase()}`,
      message: `To upgrade to ${plan}, please complete the checkout process.`,
    });
  } catch (error) {
    logger.error('Plan change error', { route: 'api/user/subscription', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}