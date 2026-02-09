/**
 * Subscription API
 * Handles subscription management, billing, and usage tracking using real database
 */

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { getDatabase } from '~/lib/.server/db/client';
import { verifySession } from '~/lib/auth/session.server';

function isProductionEnv(env: any): boolean {
  return String(env?.NODE_ENV || process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function isBillingWriteActionsEnabled(env: any): boolean {
  const raw = String(env?.BILLING_ACTIONS_ENABLED || process.env.BILLING_ACTIONS_ENABLED || '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function billingWriteDisabledResponse(env: any) {
  // Hide write endpoint surface in production unless explicitly enabled.
  if (isProductionEnv(env)) {
    return json({ error: 'Not found' }, { status: 404 });
  }
  return json(
    {
      error: 'Billing write actions are disabled. Set BILLING_ACTIONS_ENABLED=true to enable.',
      code: 'BILLING_ACTIONS_DISABLED',
    },
    { status: 503 },
  );
}

/**
 * Allowed domains for billing portal redirect URLs.
 * Only accept URLs from known payment provider domains.
 */
const ALLOWED_PORTAL_DOMAINS = new Set([
  'paddle.com',
  'sandbox.paddle.com',
  'checkout.paddle.com',
  'customer-portal.paddle.com',
  'dodopayments.com',
  'sandbox.dodopayments.com',
  'portal.dodopayments.com',
]);

function isAllowedPortalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    // Check exact match or subdomain match (e.g., "x.paddle.com" matches "paddle.com")
    for (const allowed of ALLOWED_PORTAL_DOMAINS) {
      if (hostname === allowed || hostname.endsWith(`.${allowed}`)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
    const session = await verifySession(request);
    if (!session?.user?.id) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = session.user.id;

    // Get subscription data for user from real database
    const data = await getSubscriptionData(env, userId);

    return json(data);
  } catch (error) {
    console.error('Failed to fetch subscription data:', error);
    return json(
      { error: 'Failed to fetch subscription data' },
      { status: 500 }
    );
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
    const session = await verifySession(request);
    if (!session?.user?.id) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = session.user.id;
    const url = new URL(request.url);
    const actionType = url.searchParams.get('action');

    if (!isBillingWriteActionsEnabled(env)) {
      return billingWriteDisabledResponse(env);
    }

    const body = await request.json() as any;

    switch (actionType) {
      case 'create-checkout':
        return await createCheckoutSession(env, { ...body, userId });

      case 'cancel-subscription':
        return await cancelSubscription(env, body);

      case 'create-portal':
        return await createBillingPortal(env, body);

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Subscription action failed:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    );
  }
}

async function getSubscriptionData(env: Env, userId: string) {
  const db = getDatabase(env);
  
  try {
    // Get user's subscription from database
    const subscription = await db.getUserSubscription(userId);
    
    // Get usage data
    const usage = await db.getUserUsage(userId);
    
    // Get usage statistics from logs
    const usageStats = await db.execute(`
      SELECT 
        COUNT(*) as total_generations,
        SUM(tokens_used) as total_tokens,
        SUM(cost_estimated) as total_cost,
        model_used,
        DATE(created_at) as date
      FROM usage_logs
      WHERE user_id = $1
      AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY model_used, DATE(created_at)
      ORDER BY date DESC
    `, [userId]);
    
    // Process stats
    const stats = processUsageStats(usageStats);
    
    // Determine plan and limits
    const planId = subscription?.plan_id || 'free';
    const planLimits = {
      free: 5,
      pro: 100,
      team: 500,
      enterprise: 2000,
    };
    
    const limit = subscription?.monthly_request_limit || planLimits[planId as keyof typeof planLimits] || 5;
    const used = limit - usage.used;
    
    return {
      subscription: subscription ? {
        subscription_id: subscription.subscription_id,
        customer_id: subscription.customer_id,
        provider: subscription.provider,
        plan_id: subscription.plan_id,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        cancelled_at: subscription.cancelled_at,
      } : null,
      usage: {
        allowed: usage.used < limit,
        remaining: limit - usage.used,
        limit,
        planId,
      },
      stats,
    };
  } catch (error) {
    console.error('Database query failed:', error);
    
    // Fallback to free tier if database fails
    return {
      subscription: null,
      usage: {
        allowed: true,
        remaining: 5,
        limit: 5,
        planId: 'free',
      },
      stats: {
        totalGenerations: 0,
        totalTokens: 0,
        totalCost: 0,
        byModel: {},
        byDay: [],
      },
    };
  }
}

function processUsageStats(stats: any[]) {
  if (!stats || stats.length === 0) {
    return {
      totalGenerations: 0,
      totalTokens: 0,
      totalCost: 0,
      byModel: {},
      byDay: [],
    };
  }
  
  let totalGenerations = 0;
  let totalTokens = 0;
  let totalCost = 0;
  const byModel: Record<string, number> = {};
  const byDay: Array<{ date: string; count: number }> = [];
  
  for (const row of stats) {
    const gens = parseInt(row.total_generations) || 0;
    const tokens = parseInt(row.total_tokens) || 0;
    const cost = parseFloat(row.total_cost) || 0;
    const model = row.model_used || 'unknown';
    const date = row.date;
    
    totalGenerations += gens;
    totalTokens += tokens;
    totalCost += cost;
    
    if (model) {
      byModel[model] = (byModel[model] || 0) + gens;
    }
    
    if (date) {
      const existing = byDay.find(d => d.date === date);
      if (existing) {
        existing.count += gens;
      } else {
        byDay.push({ date, count: gens });
      }
    }
  }
  
  return {
    totalGenerations,
    totalTokens,
    totalCost,
    byModel,
    byDay: byDay.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

async function createCheckoutSession(env: Env, data: any) {
  const { userId, email, planId, userCountry } = data;
  
  // Select provider based on user country
  const provider = userCountry === 'CN' ? 'dodopay' : 'paddle';
  
  try {
    if (provider === 'paddle') {
      // Use real Paddle integration
      const { getPaddleClient } = await import('~/lib/.server/payment/paddle');
      const paddle = getPaddleClient(env);
      
      const priceId = getPaddlePriceId(planId);
      const successUrl = `${env.APP_URL}/subscription/success`;
      const cancelUrl = `${env.APP_URL}/pricing`;
      
      const checkout = await paddle.createCheckout({
        priceId,
        email,
        userId,
        successUrl,
        cancelUrl,
      });
      
      return json({
        checkoutUrl: checkout.checkoutUrl,
        provider: 'paddle',
        sessionId: checkout.checkoutId,
      });
    } else {
      // Use real DodoPay integration
      const { getDodoPayClient } = await import('~/lib/.server/payment/dodopay');
      const dodopay = getDodoPayClient(env);
      
      const planAmount = getPlanAmount(planId);
      const returnUrl = `${env.APP_URL}/subscription/success`;
      
      const checkout = await dodopay.createCheckout({
        planId,
        email,
        userId,
        amount: planAmount,
        currency: 'USD',
        returnUrl,
      });
      
      return json({
        checkoutUrl: checkout.checkoutUrl,
        provider: 'dodopay',
        sessionId: checkout.sessionId,
      });
    }
  } catch (error) {
    console.error('Payment integration error:', error);
    throw error;
  }
}

function getPaddlePriceId(planId: string): string {
  const priceIds: Record<string, string> = {
    pro: process.env.PADDLE_PRICE_PRO || 'pri_pro_monthly',
    team: process.env.PADDLE_PRICE_TEAM || 'pri_team_monthly',
    enterprise: process.env.PADDLE_PRICE_ENTERPRISE || 'pri_enterprise_monthly',
  };
  return priceIds[planId] || priceIds.pro;
}

function getPlanAmount(planId: string): number {
  const amounts: Record<string, number> = {
    pro: 20,
    team: 50,
    enterprise: 200,
  };
  return amounts[planId] || 20;
}

async function cancelSubscription(env: Env, data: any) {
  const { subscriptionId, provider, immediate } = data;

  if (!subscriptionId || !provider) {
    return json({ error: 'subscriptionId and provider are required' }, { status: 400 });
  }

  const db = getDatabase(env);

  try {
    // Actually cancel with the payment provider first, before touching the DB.
    if (provider === 'paddle') {
      const { getPaddleClient } = await import('~/lib/.server/payment/paddle');
      const paddle = getPaddleClient(env);
      await paddle.cancelSubscription(subscriptionId, !!immediate);
    } else if (provider === 'dodopay') {
      const { getDodoPayClient } = await import('~/lib/.server/payment/dodopay');
      const dodopay = getDodoPayClient(env);
      await dodopay.cancelSubscription(subscriptionId, { immediate: !!immediate });
    } else {
      return json({ error: `Unsupported payment provider: ${provider}` }, { status: 400 });
    }

    // Provider cancel succeeded — now update local state.
    await db.execute(`
      UPDATE subscriptions
      SET
        cancel_at_period_end = $1,
        cancelled_at = $2,
        updated_at = NOW()
      WHERE subscription_id = $3
    `, [!immediate, immediate ? new Date() : null, subscriptionId]);

    return json({
      success: true,
      message: immediate
        ? 'Subscription cancelled immediately'
        : 'Subscription will cancel at end of billing period',
    });
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    throw error;
  }
}

async function createBillingPortal(env: Env, data: any) {
  const { customerId, provider } = data;

  if (!customerId || !provider) {
    return json({ error: 'customerId and provider are required' }, { status: 400 });
  }

  try {
    let portalUrl: string;

    if (provider === 'paddle') {
      const { getPaddleClient } = await import('~/lib/.server/payment/paddle');
      const paddle = getPaddleClient(env);
      const portal = await paddle.createBillingPortalSession(customerId);
      portalUrl = portal.url;
    } else if (provider === 'dodopay') {
      const { getDodoPayClient } = await import('~/lib/.server/payment/dodopay');
      const dodopay = getDodoPayClient(env);
      const portal = await dodopay.createBillingPortalSession(customerId);
      portalUrl = portal.url;
    } else {
      return json({ error: `Unsupported payment provider: ${provider}` }, { status: 400 });
    }

    // SSRF protection: only redirect to known payment provider domains
    if (!isAllowedPortalUrl(portalUrl)) {
      console.error(`[api.subscribe] Rejected portal URL from ${provider}: ${portalUrl}`);
      return json(
        { error: 'Billing portal returned an unexpected URL' },
        { status: 502 },
      );
    }

    return json({ portalUrl });
  } catch (error) {
    console.error(`Failed to create billing portal for customer ${customerId}:`, error);
    return json(
      { error: 'Failed to create billing portal session' },
      { status: 502 },
    );
  }
}
