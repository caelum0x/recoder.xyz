import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { dodoPayService, DodoPayService } from '@/lib/dodo-pay';
import { z } from 'zod';

const createSubscriptionSchema = z.object({
  planId: z.enum(['pro', 'enterprise']),
  billing: z.object({
    street: z.string().min(1, 'Street address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    zipcode: z.string().min(1, 'ZIP code is required'),
    country: z.string().min(2, 'Country is required')
  }),
  customer: z.object({
    phoneNumber: z.string().optional()
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { planId, billing, customer } = createSubscriptionSchema.parse(body);

    // Get plan details
    const plan = DodoPayService.getPlanById(planId);
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      );
    }

    // Create subscription with Dodo Pay
    const subscriptionRequest = {
      customer: {
        email: session.user.email,
        name: session.user.name || 'Recoder User',
        phoneNumber: customer?.phoneNumber
      },
      billing,
      productId: planId, // This should match your Dodo Pay product IDs
      quantity: 1,
      returnUrl: `${process.env.NEXTAUTH_URL}/subscription/success?plan=${planId}`
    };

    const subscriptionResponse = await dodoPayService.createSubscription(subscriptionRequest);

    // Store subscription info in database (you'll integrate this with your user management)
    // await userDb.updateSubscription(session.user.id, {
    //   subscriptionId: subscriptionResponse.subscriptionId,
    //   planId,
    //   status: 'pending',
    //   customerId: subscriptionResponse.customer.customerId
    // });

    return NextResponse.json({
      success: true,
      paymentLink: subscriptionResponse.paymentLink,
      subscriptionId: subscriptionResponse.subscriptionId,
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        features: plan.features
      }
    });

  } catch (error) {
    console.error('Subscription creation error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}