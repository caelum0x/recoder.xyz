/**
 * DODO Pay Checkout Session API Route
 * Creates checkout sessions for CLI and web subscription upgrades
 * Integrates with unified session management for real-time updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { dodoPayments } from '@/lib/dodo-payments';

interface CreateCheckoutRequest {
  userId?: string;
  plan: 'pro' | 'team' | 'enterprise';
  source?: 'cli' | 'web' | 'router' | 'extension';
  return_url?: string;
  cancel_url?: string;
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body: CreateCheckoutRequest = await request.json();

    // Validate authentication - either session or CLI-provided userId
    const userId = session?.user?.id || body.userId;
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate plan
    if (!body.plan || !['pro', 'team', 'enterprise'].includes(body.plan)) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      );
    }

    // Extract CLI-specific context
    const source = body.source || 'web';
    const metadata = {
      user_id: userId,
      source: source,
      timestamp: Date.now(),
      ...body.metadata
    };

    // Add CLI-specific return URL handling
    let returnUrl = body.return_url;
    let cancelUrl = body.cancel_url;

    if (source === 'cli') {
      // For CLI users, return to billing dashboard with success context
      returnUrl = returnUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/billing?upgraded=true&source=cli&return_to=cli_success`;
      cancelUrl = cancelUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/billing/upgrade?source=cli&cancelled=true`;
    } else {
      // For web users, use standard URLs
      returnUrl = returnUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/billing?upgraded=true`;
      cancelUrl = cancelUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/pricing`;
    }

    console.log(`Creating checkout session for user ${userId}, plan: ${body.plan}, source: ${source}`);

    // Create DODO Pay checkout session
    const checkoutSession = await dodoPayments.createCheckoutSession(
      userId,
      body.plan,
      {
        source: source,
        returnUrl: returnUrl,
        cancelUrl: cancelUrl,
        metadata: metadata
      }
    );

    console.log(`Checkout session created: ${checkoutSession.checkout_url}`);

    // Log the checkout session creation for analytics
    await logCheckoutAttempt(userId, body.plan, source, checkoutSession.subscription_id);

    return NextResponse.json({
      success: true,
      checkout_url: checkoutSession.checkout_url,
      subscription_id: checkoutSession.subscription_id,
      customer_id: checkoutSession.customer_id
    });

  } catch (error: any) {
    console.error('Failed to create checkout session:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Log checkout attempt for analytics
 */
async function logCheckoutAttempt(
  userId: string,
  plan: string,
  source: string,
  subscriptionId: string
) {
  try {
    // This would integrate with your analytics service
    const analyticsData = {
      event: 'checkout_initiated',
      user_id: userId,
      plan: plan,
      source: source,
      subscription_id: subscriptionId,
      timestamp: new Date().toISOString()
    };

    // Send to backend analytics service
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/analytics/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(analyticsData)
    });

  } catch (error) {
    console.error('Failed to log checkout attempt:', error);
    // Don't fail the checkout if analytics fails
  }
}