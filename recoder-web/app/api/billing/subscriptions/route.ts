import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';
import { db } from '@/lib/database/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20'
});

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  FREE: {
    id: 'free',
    name: 'Free',
    price_monthly: 0,
    price_yearly: 0,
    limits: {
      posts_per_month: 10,
      social_accounts: 2,
      team_members: 1,
      ai_generations: 5,
      campaigns: 1,
      analytics_retention_days: 30
    },
    features: [
      'Basic posting',
      'Limited analytics',
      'Email support'
    ]
  },
  PRO: {
    id: 'pro',
    name: 'Pro',
    price_monthly: 29,
    price_yearly: 290,
    stripe_price_id_monthly: 'price_pro_monthly',
    stripe_price_id_yearly: 'price_pro_yearly',
    limits: {
      posts_per_month: 100,
      social_accounts: 10,
      team_members: 3,
      ai_generations: 100,
      campaigns: 10,
      analytics_retention_days: 90
    },
    features: [
      'Advanced scheduling',
      'Detailed analytics',
      'AI content generation',
      'Campaign management',
      'Priority support'
    ]
  },
  AGENCY: {
    id: 'agency',
    name: 'Agency',
    price_monthly: 79,
    price_yearly: 790,
    stripe_price_id_monthly: 'price_agency_monthly',
    stripe_price_id_yearly: 'price_agency_yearly',
    limits: {
      posts_per_month: 500,
      social_accounts: 50,
      team_members: 10,
      ai_generations: 500,
      campaigns: 50,
      analytics_retention_days: 180
    },
    features: [
      'Everything in Pro',
      'Team collaboration',
      'Client management',
      'White-label reports',
      'Advanced automation',
      'API access'
    ]
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    price_monthly: 199,
    price_yearly: 1990,
    stripe_price_id_monthly: 'price_enterprise_monthly',
    stripe_price_id_yearly: 'price_enterprise_yearly',
    limits: {
      posts_per_month: -1, // Unlimited
      social_accounts: -1,
      team_members: -1,
      ai_generations: -1,
      campaigns: -1,
      analytics_retention_days: 365
    },
    features: [
      'Everything in Agency',
      'Unlimited everything',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantee',
      'Custom contracts'
    ]
  }
};

// Create or update subscription
export const POST = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { action, plan_id, billing_cycle = 'monthly', payment_method_id, team_id } = body;

    if (action === 'create_subscription') {
      return await createSubscription(user, plan_id, billing_cycle, payment_method_id, team_id);
    }

    if (action === 'update_subscription') {
      return await updateSubscription(user, plan_id, billing_cycle, team_id);
    }

    if (action === 'cancel_subscription') {
      return await cancelSubscription(user, team_id);
    }

    if (action === 'resume_subscription') {
      return await resumeSubscription(user, team_id);
    }

    if (action === 'get_plans') {
      return NextResponse.json({
        success: true,
        plans: SUBSCRIPTION_PLANS
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Billing error:', error);
    return NextResponse.json(
      { error: 'Billing operation failed' },
      { status: 500 }
    );
  }
});

// Get current subscription
export const GET = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');

    // Get current subscription
    const subscriptionQuery = `
      SELECT s.*, u.email as billing_email
      FROM subscriptions s
      JOIN users u ON (s.user_id = u.id OR s.team_id = $2)
      WHERE (s.user_id = $1 OR s.team_id = $2)
        AND s.status IN ('trialing', 'active', 'past_due')
      ORDER BY s.created_at DESC
      LIMIT 1
    `;

    const result = await db.query(subscriptionQuery, [user.userId, teamId]);
    const subscription = result.rows[0];

    // Get usage data
    const currentUsage = await getCurrentUsage(user.userId, teamId);

    // Get billing history
    const billingHistory = await getBillingHistory(user.userId, teamId);

    if (!subscription) {
      return NextResponse.json({
        success: true,
        subscription: null,
        current_plan: SUBSCRIPTION_PLANS.FREE,
        usage: currentUsage,
        billing_history: billingHistory
      });
    }

    // Sync with Stripe if needed
    let stripeSubscription = null;
    if (subscription.stripe_subscription_id) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
        
        // Update local subscription if Stripe status differs
        if (stripeSubscription.status !== subscription.status) {
          await updateSubscriptionStatus(subscription.id, stripeSubscription.status);
          subscription.status = stripeSubscription.status;
        }
      } catch (stripeError) {
        console.error('Stripe sync error:', stripeError);
      }
    }

    const currentPlan = Object.values(SUBSCRIPTION_PLANS).find(plan => plan.id === subscription.plan_id) || SUBSCRIPTION_PLANS.FREE;

    return NextResponse.json({
      success: true,
      subscription: {
        ...subscription,
        stripe_data: stripeSubscription
      },
      current_plan: currentPlan,
      usage: currentUsage,
      billing_history: billingHistory
    });

  } catch (error) {
    console.error('Get subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription data' },
      { status: 500 }
    );
  }
});

async function createSubscription(user: any, planId: string, billingCycle: string, paymentMethodId: string, teamId?: string) {
  const plan = SUBSCRIPTION_PLANS[planId.toUpperCase()];
  if (!plan) {
    throw new Error('Invalid plan');
  }

  if (plan.id === 'free') {
    throw new Error('Cannot create subscription for free plan');
  }

  // Get or create Stripe customer
  const customer = await getOrCreateStripeCustomer(user, teamId);

  // Attach payment method
  if (paymentMethodId) {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });

    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  // Create Stripe subscription
  const priceId = billingCycle === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
  const stripeSubscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  });

  // Save subscription to database
  const subscriptionQuery = `
    INSERT INTO subscriptions (
      user_id, team_id, stripe_subscription_id, stripe_customer_id,
      plan_id, plan_name, price_monthly, price_yearly, billing_cycle,
      status, current_period_start, current_period_end
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;

  const subscriptionResult = await db.query(subscriptionQuery, [
    user.userId,
    teamId,
    stripeSubscription.id,
    customer.id,
    plan.id,
    plan.name,
    plan.price_monthly,
    plan.price_yearly,
    billingCycle,
    stripeSubscription.status,
    new Date(stripeSubscription.current_period_start * 1000),
    new Date(stripeSubscription.current_period_end * 1000)
  ]);

  // Update user/team subscription tier
  if (teamId) {
    await db.query('UPDATE teams SET subscription_tier = $1 WHERE id = $2', [plan.id, teamId]);
  } else {
    await db.query('UPDATE users SET subscription_tier = $1, subscription_status = $2 WHERE id = $3', 
      [plan.id, stripeSubscription.status, user.userId]);
  }

  const subscription = subscriptionResult.rows[0];

  return NextResponse.json({
    success: true,
    subscription,
    client_secret: stripeSubscription.latest_invoice?.payment_intent?.client_secret,
    requires_action: stripeSubscription.status === 'incomplete'
  });
}

async function updateSubscription(user: any, planId: string, billingCycle: string, teamId?: string) {
  // Get current subscription
  const currentSub = await getCurrentSubscription(user.userId, teamId);
  if (!currentSub) {
    throw new Error('No active subscription found');
  }

  const plan = SUBSCRIPTION_PLANS[planId.toUpperCase()];
  if (!plan) {
    throw new Error('Invalid plan');
  }

  // Update Stripe subscription
  const priceId = billingCycle === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
  const stripeSubscription = await stripe.subscriptions.update(currentSub.stripe_subscription_id, {
    items: [{
      id: (await stripe.subscriptions.retrieve(currentSub.stripe_subscription_id)).items.data[0].id,
      price: priceId,
    }],
    proration_behavior: 'create_prorations',
  });

  // Update local subscription
  await db.query(`
    UPDATE subscriptions 
    SET plan_id = $1, plan_name = $2, price_monthly = $3, price_yearly = $4, 
        billing_cycle = $5, current_period_end = $6
    WHERE id = $7
  `, [
    plan.id, plan.name, plan.price_monthly, plan.price_yearly,
    billingCycle, new Date(stripeSubscription.current_period_end * 1000),
    currentSub.id
  ]);

  // Update user/team tier
  if (teamId) {
    await db.query('UPDATE teams SET subscription_tier = $1 WHERE id = $2', [plan.id, teamId]);
  } else {
    await db.query('UPDATE users SET subscription_tier = $1 WHERE id = $2', [plan.id, user.userId]);
  }

  return NextResponse.json({
    success: true,
    message: 'Subscription updated successfully'
  });
}

async function cancelSubscription(user: any, teamId?: string) {
  const currentSub = await getCurrentSubscription(user.userId, teamId);
  if (!currentSub) {
    throw new Error('No active subscription found');
  }

  // Cancel at period end in Stripe
  await stripe.subscriptions.update(currentSub.stripe_subscription_id, {
    cancel_at_period_end: true
  });

  // Update local subscription
  await db.query(`
    UPDATE subscriptions 
    SET status = 'canceled', canceled_at = NOW()
    WHERE id = $1
  `, [currentSub.id]);

  return NextResponse.json({
    success: true,
    message: 'Subscription canceled successfully',
    cancels_at: currentSub.current_period_end
  });
}

async function resumeSubscription(user: any, teamId?: string) {
  const currentSub = await getCurrentSubscription(user.userId, teamId);
  if (!currentSub) {
    throw new Error('No subscription found');
  }

  // Resume in Stripe
  await stripe.subscriptions.update(currentSub.stripe_subscription_id, {
    cancel_at_period_end: false
  });

  // Update local subscription
  await db.query(`
    UPDATE subscriptions 
    SET status = 'active', canceled_at = NULL
    WHERE id = $1
  `, [currentSub.id]);

  return NextResponse.json({
    success: true,
    message: 'Subscription resumed successfully'
  });
}

async function getOrCreateStripeCustomer(user: any, teamId?: string) {
  // Check if customer exists in our database
  const customerQuery = `
    SELECT stripe_customer_id FROM subscriptions 
    WHERE (user_id = $1 OR team_id = $2) AND stripe_customer_id IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `;
  
  const result = await db.query(customerQuery, [user.userId, teamId]);
  
  if (result.rows.length > 0) {
    // Return existing customer
    return await stripe.customers.retrieve(result.rows[0].stripe_customer_id);
  }

  // Create new customer
  const customerData: any = {
    email: user.email,
    metadata: {
      user_id: user.userId,
      team_id: teamId || ''
    }
  };

  if (teamId) {
    // Get team info
    const teamQuery = `SELECT name, billing_email FROM teams WHERE id = $1`;
    const teamResult = await db.query(teamQuery, [teamId]);
    if (teamResult.rows.length > 0) {
      const team = teamResult.rows[0];
      customerData.name = team.name;
      customerData.email = team.billing_email || user.email;
    }
  }

  return await stripe.customers.create(customerData);
}

async function getCurrentSubscription(userId: string, teamId?: string) {
  const query = `
    SELECT * FROM subscriptions 
    WHERE (user_id = $1 OR team_id = $2) 
      AND status IN ('trialing', 'active', 'past_due', 'canceled')
    ORDER BY created_at DESC LIMIT 1
  `;
  
  const result = await db.query(query, [userId, teamId]);
  return result.rows[0] || null;
}

async function getCurrentUsage(userId: string, teamId?: string) {
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01'; // First day of current month
  
  const usageQuery = `
    SELECT 
      resource_type,
      SUM(quantity) as total_usage,
      SUM(cost) as total_cost
    FROM usage_tracking
    WHERE (user_id = $1 OR team_id = $2) 
      AND date >= $3
    GROUP BY resource_type
  `;
  
  const result = await db.query(usageQuery, [userId, teamId, currentMonth]);
  
  const usage = {};
  result.rows.forEach(row => {
    usage[row.resource_type] = {
      used: parseInt(row.total_usage),
      cost: parseFloat(row.total_cost)
    };
  });

  // Add computed usage
  const additionalUsage = await getAdditionalUsage(userId, teamId);
  
  return { ...usage, ...additionalUsage };
}

async function getAdditionalUsage(userId: string, teamId?: string) {
  // Get counts for various resources
  const queries = await Promise.all([
    db.query('SELECT COUNT(*) FROM social_accounts WHERE user_id = $1 OR team_id = $2', [userId, teamId]),
    db.query('SELECT COUNT(*) FROM team_members WHERE team_id = $1', [teamId]),
    db.query('SELECT COUNT(*) FROM campaigns WHERE user_id = $1 OR team_id = $2', [userId, teamId]),
  ]);

  return {
    social_accounts: { used: parseInt(queries[0].rows[0].count) },
    team_members: { used: parseInt(queries[1].rows[0].count) },
    campaigns: { used: parseInt(queries[2].rows[0].count) }
  };
}

async function getBillingHistory(userId: string, teamId?: string) {
  // Get Stripe invoices
  const subscription = await getCurrentSubscription(userId, teamId);
  if (!subscription?.stripe_customer_id) {
    return [];
  }

  try {
    const invoices = await stripe.invoices.list({
      customer: subscription.stripe_customer_id,
      limit: 12
    });

    return invoices.data.map(invoice => ({
      id: invoice.id,
      amount: invoice.total / 100,
      currency: invoice.currency,
      status: invoice.status,
      date: new Date(invoice.created * 1000),
      pdf_url: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url
    }));
  } catch (error) {
    console.error('Failed to fetch billing history:', error);
    return [];
  }
}

async function updateSubscriptionStatus(subscriptionId: string, status: string) {
  await db.query('UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2', 
    [status, subscriptionId]);
}