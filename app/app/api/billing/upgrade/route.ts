import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';

const PADDLE_VENDOR_ID = process.env.NEXT_PUBLIC_PADDLE_VENDOR_ID;
const DODO_API_KEY = process.env.DODO_API_KEY;

const PLAN_PRICES = {
  weekly: { id: process.env.PADDLE_WEEKLY_PLAN_ID || '12345', price: 7 },
  monthly: { id: process.env.PADDLE_MONTHLY_PLAN_ID || '12346', price: 20 },
  enterprise: { id: process.env.PADDLE_ENTERPRISE_PLAN_ID || '12347', price: 99 }
};

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!plan || !PLAN_PRICES[plan as keyof typeof PLAN_PRICES]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: authUser.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.plan === plan) {
      return NextResponse.json({ error: 'Already on this plan' }, { status: 400 });
    }

    const planDetails = PLAN_PRICES[plan as keyof typeof PLAN_PRICES];

    const checkoutUrl = `https://checkout.paddle.com/checkout/custom/${planDetails.id}?` +
      `passthrough=${JSON.stringify({ user_id: user.id, plan })}&` +
      `email=${encodeURIComponent(user.email)}&` +
      `success_url=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL + '/billing?upgraded=true')}&` +
      `cancel_url=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL + '/billing/upgrade')}`;

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'upgrade_initiated',
        resource: 'billing',
        metadata: { newPlan: plan, oldPlan: user.plan },
        ipAddress: request.headers.get('x-forwarded-for') || '0.0.0.0',
        timestamp: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      redirectUrl: checkoutUrl,
      plan,
      price: planDetails.price
    });

  } catch (error) {
    console.error('Upgrade error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate upgrade' },
      { status: 500 }
    );
  }
}
