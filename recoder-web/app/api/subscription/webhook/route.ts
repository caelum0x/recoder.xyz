import { NextRequest, NextResponse } from 'next/server';
import { dodoPayService, WebhookEvent } from '@/lib/dodo-pay';
import { headers } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Get the raw body
    const body = await request.text();
    
    // Get the signature from headers
    const headersList = headers();
    const signature = (await headersList).get('dodo-signature') || (await headersList).get('x-dodo-signature') || '';

    // Verify webhook signature
    if (!dodoPayService.verifyWebhookSignature(body, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 } 
      );
    }

    // Parse the webhook event
    const event: WebhookEvent = JSON.parse(body);
    
    console.log(`Received Dodo Pay webhook: ${event.type}`, {
      subscriptionId: event.data.subscriptionId,
      customerId: event.data.customerId,
      timestamp: event.timestamp
    });

    // Handle the webhook event
    await dodoPayService.handleWebhook(event);

    // Update local database based on webhook event
    switch (event.type) {
      case 'subscription.active':
        // Update user subscription to active
        console.log('Activating subscription:', event.data.subscriptionId);
        // await userDb.updateSubscriptionStatus(event.data.customerId, 'active');
        // await usageDb.resetUsageLimits(event.data.customerId);
        break;

      case 'subscription.on_hold':
        // Put subscription on hold
        console.log('Putting subscription on hold:', event.data.subscriptionId);
        // await userDb.updateSubscriptionStatus(event.data.customerId, 'on_hold');
        break;

      case 'subscription.failed':
        // Mark subscription as failed
        console.log('Subscription failed:', event.data.subscriptionId);
        // await userDb.updateSubscriptionStatus(event.data.customerId, 'failed');
        break;

      case 'subscription.renewed':
        // Handle successful renewal
        console.log('Subscription renewed:', event.data.subscriptionId);
        // await usageDb.resetUsageLimits(event.data.customerId);
        // await userDb.updateSubscriptionRenewal(event.data.customerId);
        break;

      case 'payment.succeeded':
        // Log successful payment
        console.log('Payment succeeded for subscription:', event.data.subscriptionId);
        // await userDb.logPayment(event.data.customerId, 'succeeded', event.data.amount);
        break;

      case 'payment.failed':
        // Log failed payment
        console.log('Payment failed for subscription:', event.data.subscriptionId);
        // await userDb.logPayment(event.data.customerId, 'failed', event.data.amount);
        break;

      default:
        console.warn(`Unhandled webhook event: ${event.type}`);
    }

    // Return success response
    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// Disable body parsing to get raw body for signature verification
export const runtime = 'nodejs';
export const preferredRegion = 'auto';