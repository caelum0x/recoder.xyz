import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

import { prisma } from '@/lib/prisma';

// GET /api/billing/dashboard - Get billing dashboard data
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Fetch subscription with its plan details for pricing
    const subscription = await prisma.subscriptions.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // Look up plan price: prefer subscription.amount, then fall back to subscription_plans table
    let planAmount = 0;
    if (subscription) {
      if (subscription.amount != null && subscription.amount > 0) {
        planAmount = subscription.amount;
      } else {
        const plan = await prisma.subscription_plans.findUnique({
          where: { id: subscription.planId },
          select: { price: true },
        });
        if (plan?.price) {
          planAmount = Number(plan.price);
        }
      }
    }

    // Fetch current month usage from usage_records
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usageRecords = await prisma.usage_records.findMany({
      where: {
        userId: user.id,
        timestamp: { gte: startOfMonth },
      },
    });

    const usage = {
      _sum: {
        requestCount: usageRecords.length,
        totalTokens: usageRecords.reduce((sum, r) => sum + (r.tokens || 0), 0),
        totalCost: usageRecords.reduce((sum, r) => sum + (r.cost || 0), 0),
      }
    };

    // Fetch default payment method
    const paymentMethod = await prisma.payment_methods.findFirst({
      where: {
        userId: user.id,
        isDefault: true,
      },
    });

    // Calculate next payment date
    const nextPaymentDate = subscription?.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return NextResponse.json({
      success: true,
      data: {
        subscription: subscription ? {
          plan: subscription.planId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          amount: planAmount,
          currency: subscription.currency || 'USD',
        } : {
          plan: 'free',
          status: 'active',
          currentPeriodEnd: nextPaymentDate.toISOString(),
          cancelAtPeriodEnd: false,
          amount: 0,
          currency: 'USD',
        },
        usage: {
          requests: usage._sum.requestCount || 0,
          tokens: usage._sum.totalTokens || 0,
          cost: usage._sum.totalCost || 0,
        },
        nextPayment: subscription ? {
          date: subscription.currentPeriodEnd.toISOString(),
          amount: planAmount,
        } : null,
        paymentMethod: paymentMethod ? {
          type: paymentMethod.brand || 'Card',
          last4: paymentMethod.last4,
          expiry: paymentMethod.expMonth && paymentMethod.expYear
            ? `${paymentMethod.expMonth.toString().padStart(2, '0')}/${paymentMethod.expYear}`
            : 'N/A',
        } : null,
      },
    });
  } catch (error) {
    logger.error('Error fetching billing dashboard', { route: 'api/billing/dashboard', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch billing data' },
      { status: 500 }
    );
  }
}
