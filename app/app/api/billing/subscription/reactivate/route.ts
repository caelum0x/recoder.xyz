import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';

// POST /api/billing/subscription/reactivate - Reactivate cancelled subscription
export async function POST(req: NextRequest) {
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

    const subscription = await prisma.subscriptions.findFirst({
      where: {
        userId: user.id,
        cancelAtPeriodEnd: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'No cancelled subscription found' },
        { status: 404 }
      );
    }

    // Check if still within the current period
    if (new Date() > subscription.currentPeriodEnd) {
      return NextResponse.json(
        { success: false, error: 'Subscription period has already ended' },
        { status: 400 }
      );
    }

    // Reactivate the subscription
    await prisma.subscriptions.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        updatedAt: new Date(),
      },
    });

    // In a real app, also call payment provider API to reactivate

    return NextResponse.json({
      success: true,
      message: 'Subscription reactivated successfully',
    });
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reactivate subscription' },
      { status: 500 }
    );
  }
}
