/**
 * Paddle Webhooks Handler
 * Processes subscription events from Paddle
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('paddle-signature');

    // Verify webhook signature (skip in development)
    if (process.env.NODE_ENV === 'production' && !verifyPaddleWebhook(body, signature)) {
      return NextResponse.json({
        success: false,
        error: 'invalid_signature'
      }, { status: 401 });
    }

    const event = JSON.parse(body);
    
    // Handle different event types
    switch (event.alert_name) {
      case 'subscription_created':
        await handleSubscriptionCreated(event);
        break;
      
      case 'subscription_updated':
        await handleSubscriptionUpdated(event);
        break;
      
      case 'subscription_cancelled':
        await handleSubscriptionCancelled(event);
        break;
      
      case 'subscription_payment_succeeded':
        await handlePaymentSucceeded(event);
        break;
      
      case 'subscription_payment_failed':
        await handlePaymentFailed(event);
        break;
      
      default:
        console.log('Unhandled Paddle event:', event.alert_name);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Paddle webhook error:', error);
    return NextResponse.json({
      success: false,
      error: 'webhook_error'
    }, { status: 500 });
  }
}

function verifyPaddleWebhook(body: string, signature: string | null): boolean {
  if (!signature || !process.env.PADDLE_WEBHOOK_SECRET) {
    return false;
  }

  const hmac = crypto
    .createHmac('sha256', process.env.PADDLE_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  return hmac === signature;
}

async function handleSubscriptionCreated(event: any) {
  const { passthrough, subscription_id, email, status } = event;
  const { userId, plan } = JSON.parse(passthrough || '{}');

  console.log('✅ Subscription created:', { userId, plan, subscription_id, status });
  
  // TODO: Update database with subscription info
}

async function handleSubscriptionUpdated(event: any) {
  const { subscription_id, status } = event;
  console.log('✅ Subscription updated:', { subscription_id, status });
}

async function handleSubscriptionCancelled(event: any) {
  const { subscription_id } = event;
  console.log('✅ Subscription cancelled:', { subscription_id });
}

async function handlePaymentSucceeded(event: any) {
  const { subscription_id, receipt_url } = event;
  console.log('✅ Payment succeeded:', { subscription_id });
}

async function handlePaymentFailed(event: any) {
  const { subscription_id } = event;
  console.log('❌ Payment failed:', { subscription_id });
}
