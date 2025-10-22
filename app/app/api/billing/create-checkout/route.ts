/**
 * Create Checkout Session API
 * Handles creation of checkout sessions for Paddle and DODO Payments
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';


export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { plan, paymentMethod } = body;

    if (!plan || !paymentMethod) {
      return NextResponse.json(
        { error: 'Missing plan or payment method' },
        { status: 400 }
      );
    }

    // Plan configuration
    const planConfig: Record<string, { priceId: string; amount: number }> = {
      weekly: { priceId: 'price_weekly', amount: 1000 }, // $10
      monthly: { priceId: 'price_monthly', amount: 2000 }, // $20
      pro: { priceId: 'price_pro', amount: 10000 }, // $100
      enterprise: { priceId: 'price_enterprise', amount: 50000 }, // $500
    };

    const selectedPlan = planConfig[plan];
    if (!selectedPlan) {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://recoder.xyz';

    if (paymentMethod === 'paddle') {
      // Paddle integration
      const paddleVendorId = process.env.PADDLE_VENDOR_ID;
      const paddleAuthCode = process.env.PADDLE_AUTH_CODE;

      if (!paddleVendorId || !paddleAuthCode) {
        console.warn('Paddle credentials not configured');
        return NextResponse.json(
          { error: 'Payment provider not configured. Please contact support.' },
          { status: 503 }
        );
      }

      // Create Paddle checkout
      const paddleResponse = await fetch('https://vendors.paddle.com/api/2.0/product/generate_pay_link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          vendor_id: paddleVendorId,
          vendor_auth_code: paddleAuthCode,
          product_id: selectedPlan.priceId,
          customer_email: user.email,
          passthrough: JSON.stringify({
            userId: user.id,
            plan,
          }),
          return_url: `${baseUrl}/checkout/success?plan=${plan}`,
          webhook_url: `${baseUrl}/api/paddle/webhooks`,
        }),
      });

      const paddleData = await paddleResponse.json();

      if (paddleData.success && paddleData.response?.url) {
        return NextResponse.json({
          success: true,
          checkoutUrl: paddleData.response.url,
          provider: 'paddle',
        });
      } else {
        throw new Error('Failed to create Paddle checkout');
      }
    } else if (paymentMethod === 'dodo') {
      // DODO Payments integration
      const dodoApiKey = process.env.DODO_API_KEY;

      if (!dodoApiKey) {
        console.warn('DODO Payments credentials not configured');
        return NextResponse.json(
          { error: 'Payment provider not configured. Please contact support.' },
          { status: 503 }
        );
      }

      // Create DODO checkout
      const dodoResponse = await fetch('https://api.dodopayments.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${dodoApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: selectedPlan.amount,
          currency: 'USD',
          customer_email: user.email,
          metadata: {
            userId: user.id,
            plan,
          },
          success_url: `${baseUrl}/checkout/success?plan=${plan}`,
          cancel_url: `${baseUrl}/checkout?plan=${plan}`,
          webhook_url: `${baseUrl}/api/dodo/webhooks`,
        }),
      });

      if (!dodoResponse.ok) {
        throw new Error('Failed to create DODO checkout');
      }

      const dodoData = await dodoResponse.json();

      if (dodoData.checkout_url) {
        return NextResponse.json({
          success: true,
          checkoutUrl: dodoData.checkout_url,
          provider: 'dodo',
        });
      } else {
        throw new Error('No checkout URL from DODO');
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid payment method' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Checkout creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
