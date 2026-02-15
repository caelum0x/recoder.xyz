import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import crypto from 'crypto';

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
    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionPlan: true,
        subscriptionStatus: true
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get subscription plan details
    const plans = await prisma.subscription_plans.findMany({
      include: {
        subscription_plan_features: {
          orderBy: { sortOrder: 'asc' },
        },
        subscription_plan_limits: true,
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
      availablePlans: plans,
    });

  } catch (error) {
    console.error('Get subscription error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to fetch subscription',
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
    const plan = await prisma.subscription_plans.findUnique({
      where: { id: planId },
    });

    if (!plan || !plan.active) {
      return NextResponse.json(
        { error: 'Invalid plan', message: 'Plan not found or inactive' },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.users.findUnique({
      where: { email: authUser.email }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Create or update subscription
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Create new subscription
    const subscription = await prisma.subscriptions.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        planId,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        paymentMethodId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Update user's subscription plan
    await prisma.users.update({
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
        message: 'Failed to update subscription',
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
    const user = await prisma.users.findUnique({
      where: { email: authUser.email }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get active subscription
    const subscription = await prisma.subscriptions.findFirst({
      where: { 
        userId: user.id,
        status: 'active'
      }
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription' },
        { status: 404 }
      );
    }

    if (immediately) {
      // Cancel immediately
      await prisma.subscriptions.update({
        where: { id: subscription.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        },
      });

      // Downgrade user to free plan
      await prisma.users.update({
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
      await prisma.subscriptions.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          cancelledAt: new Date(),
          updatedAt: new Date(),
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
        message: 'Failed to cancel subscription',
      },
      { status: 500 }
    );
  }
}
