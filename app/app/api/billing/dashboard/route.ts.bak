import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

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

    const user = await prisma.user.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Fetch subscription
    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usage = await prisma.usage.aggregate({
      where: {
        userId: user.id,
        timestamp: { gte: startOfMonth },
      },
      _sum: {
        requestCount: true,
        totalTokens: true,
        totalCost: true,
      },
    });

    // Fetch default payment method
    const paymentMethod = await prisma.paymentMethod.findFirst({
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
          amount: subscription.amount,
          currency: 'USD',
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
          amount: subscription.amount,
        } : null,
        paymentMethod: paymentMethod ? {
          type: paymentMethod.brand || 'Card',
          last4: paymentMethod.last4,
          expiry: `${paymentMethod.expiryMonth.toString().padStart(2, '0')}/${paymentMethod.expiryYear}`,
        } : null,
      },
    });
  } catch (error) {
    console.error('Error fetching billing dashboard:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch billing data' },
      { status: 500 }
    );
  }
}
