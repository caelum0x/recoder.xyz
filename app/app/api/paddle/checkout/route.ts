/**
 * Paddle Checkout API
 * Creates checkout session for subscriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
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
      weekly: process.env.PADDLE_PRODUCT_WEEKLY || 'prod_weekly_temp',
      monthly: process.env.PADDLE_PRODUCT_MONTHLY || 'prod_monthly_temp',
      pro: process.env.PADDLE_PRODUCT_PRO || 'prod_pro_temp'
    };

    const productId = productIds[plan];

    // Return checkout data for client-side Paddle.js
    return NextResponse.json({
      success: true,
      data: {
        productId,
        email: session.user.email,
        userId: session.user.id,
        passthrough: JSON.stringify({
          userId: session.user.id,
          plan: plan
        }),
        successUrl: successUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}/dashboard?payment=success`,
        cancelUrl: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}/pricing`
      }
    });

  } catch (error: any) {
    console.error('Paddle checkout error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: 'Failed to create checkout session'
    }, { status: 500 });
  }
}
