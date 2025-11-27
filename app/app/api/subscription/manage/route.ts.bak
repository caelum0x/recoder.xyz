import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * GET /api/subscription/manage
 * Get current subscription details
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    // Fetch user's subscription from database
    const user = await prisma.user.findUnique({
      where: { email: authUser.email },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            paymentMethod: true,
            invoices: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const subscription = user.subscriptions[0] || null;

    // Get subscription plan details
    const plans = await prisma.subscriptionPlan.findMany({
      include: {
        features: {
          orderBy: { sortOrder: 'asc' },
        },
        limits: true,
      },
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.subscriptionPlan || 'free',
        status: user.subscriptionStatus || 'active',
      },
      subscription,
      availablePlans: plans,
    });

  } catch (error) {
    console.error('Get subscription error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to fetch subscription',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/subscription/manage
 * Update or create subscription
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, planId, paymentMethodId } = body;

    if (!action || !['upgrade', 'downgrade', 'change'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action', message: 'Action must be upgrade, downgrade, or change' },
        { status: 400 }
      );
    }

    if (!planId) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Verify plan exists
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan || !plan.active) {
      return NextResponse.json(
        { error: 'Invalid plan', message: 'Plan not found or inactive' },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: authUser.email },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const currentSubscription = user.subscriptions[0];

    // Create or update subscription
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    let subscription;
    
    if (currentSubscription) {
      // Update existing subscription
      subscription = await prisma.subscription.update({
        where: { id: currentSubscription.id },
        data: {
          planId,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          paymentMethodId: paymentMethodId || currentSubscription.paymentMethodId,
        },
      });
    } else {
      // Create new subscription
      subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          planId,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          paymentMethodId,
        },
      });
    }

    // Update user's subscription plan
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionPlan: planId,
        subscriptionStatus: 'active',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription,
    });

  } catch (error) {
    console.error('Update subscription error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to update subscription',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/subscription/manage
 * Cancel subscription
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const immediately = searchParams.get('immediately') === 'true';

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: authUser.email },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const subscription = user.subscriptions[0];

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription' },
        { status: 404 }
      );
    }

    if (immediately) {
      // Cancel immediately
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelAtPeriodEnd: false,
        },
      });

      // Downgrade user to free plan
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionPlan: 'free',
          subscriptionStatus: 'active',
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Subscription cancelled immediately',
      });
    } else {
      // Cancel at period end
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          cancelledAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Subscription will be cancelled at ${subscription.currentPeriodEnd.toLocaleDateString()}`,
        periodEnd: subscription.currentPeriodEnd,
      });
    }

  } catch (error) {
    console.error('Cancel subscription error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to cancel subscription',
      },
      { status: 500 }
    );
  }
}
