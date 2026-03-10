/**
 * Paddle Checkout API
 * Creates checkout session for subscriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });
    
    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'unauthorized',
        message: 'You must be logged in to purchase'
      }, { status: 401 });
    }

    const body = await request.json();
    const { plan, successUrl, cancelUrl } = body;

    // Validate plan
    const validPlans = ['weekly', 'monthly', 'pro'];
    if (!validPlans.includes(plan)) {
      return NextResponse.json({
        success: false,
        error: 'invalid_plan',
        message: 'Invalid subscription plan'
      }, { status: 400 });
    }

    // Get product ID based on plan
    const productIds: Record<string, string> = {
      weekly: process.env.PADDLE_PRODUCT_WEEKLY || 'pro_01jrp8y7mhdrng9hhz2e2ksxs3',
      monthly: process.env.PADDLE_PRODUCT_MONTHLY || 'pro_01jrp8zjr8n2pc8ryt4v16qfef',
      pro: process.env.PADDLE_PRODUCT_PRO || 'pro_01jrp90dg3hc0tn6xhm3me6bjk'
    };

    const productId = productIds[plan];

    // Return checkout data for client-side Paddle.js
    return NextResponse.json({
      success: true,
      data: {
        productId,
        email: session.user.email,
        userId: session.user.id,
        customData: {
          userId: session.user.id,
          plan: plan
        },
        successUrl: successUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}/dashboard?payment=success`,
        cancelUrl: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}/pricing`
      }
    });

  } catch (error) {
    console.error('Paddle checkout error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: 'Failed to create checkout session'
    }, { status: 500 });
  }
}
