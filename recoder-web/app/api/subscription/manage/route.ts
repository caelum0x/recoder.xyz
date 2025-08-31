import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { authOptions } from '@/lib/auth';
import { dodoPayService } from '@/lib/dodo-pay';
import { z } from 'zod';

const manageSubscriptionSchema = z.object({
  action: z.enum(['list', 'cancel', 'change_plan']),
  subscriptionId: z.string().optional(),
  newPlanId: z.string().optional(),
  prorationOption: z.enum(['prorated_immediately', 'full_immediately']).optional()
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, subscriptionId, newPlanId, prorationOption } = manageSubscriptionSchema.parse(body);

    switch (action) {
      case 'list':
        return await listUserSubscriptions(session.user.email);
      
      case 'cancel':
        if (!subscriptionId) {
          return NextResponse.json(
            { error: 'Subscription ID required for cancellation' },
            { status: 400 }
          );
        }
        return await cancelSubscription(subscriptionId);
      
      case 'change_plan':
        if (!subscriptionId || !newPlanId) {
          return NextResponse.json(
            { error: 'Subscription ID and new plan ID required' },
            { status: 400 }
          );
        }
        return await changePlan(subscriptionId, newPlanId, prorationOption);
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Subscription management error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to manage subscription' },
      { status: 500 }
    );
  }
}

async function listUserSubscriptions(userEmail: string) {
  try {
    // Call Dodo Pay List Subscriptions API
    const response = await fetch(`${process.env.DODO_API_BASE_URL}/subscriptions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Dodo Pay API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter subscriptions for the current user
    const userSubscriptions = data.items?.filter((sub: any) => 
      sub.customer.email === userEmail
    ) || [];

    return NextResponse.json({
      success: true,
      subscriptions: userSubscriptions.map((sub: any) => ({
        subscriptionId: sub.subscription_id,
        productId: sub.product_id,
        status: sub.status,
        amount: sub.recurring_pre_tax_amount,
        currency: sub.currency,
        nextBillingDate: sub.next_billing_date,
        previousBillingDate: sub.previous_billing_date,
        createdAt: sub.created_at,
        cancelAtNextBilling: sub.cancel_at_next_billing_date,
        trialPeriodDays: sub.trial_period_days,
        customer: sub.customer
      }))
    });

  } catch (error) {
    console.error('Error listing subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to list subscriptions' },
      { status: 500 }
    );
  }
}

async function cancelSubscription(subscriptionId: string) {
  try {
    const result = await dodoPayService.cancelSubscription(subscriptionId);
    
    return NextResponse.json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: result
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}

async function changePlan(
  subscriptionId: string, 
  newPlanId: string, 
  prorationOption: 'prorated_immediately' | 'full_immediately' = 'prorated_immediately'
) {
  try {
    const result = await dodoPayService.changeSubscriptionPlan(
      subscriptionId, 
      newPlanId, 
      prorationOption
    );
    
    return NextResponse.json({
      success: true,
      message: 'Subscription plan changed successfully',
      data: result
    });

  } catch (error) {
    console.error('Error changing plan:', error);
    return NextResponse.json(
      { error: 'Failed to change subscription plan' },
      { status: 500 }
    );
  }
}