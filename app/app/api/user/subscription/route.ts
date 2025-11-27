// User subscription management endpoint
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { getUserFromToken } from '@/lib/auth-helper';
import { prisma } from '@/lib/prisma';
import { userManager } from '@/lib/user-management';

type PlanType = 'free' | 'pro' | 'enterprise';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user with subscription info
    const userWithInfo = await prisma.users.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        hasOwnApiKey: true,
        createdAt: true
      }
    });

    if (!userWithInfo) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      plan: userWithInfo.subscriptionPlan,
      subscription_status: userWithInfo.subscriptionStatus,
      subscription_ends_at: null,
      available_plans: [
        {
          name: 'FREE',
          display_name: 'Free',
          price: 0,
          features: [
            '50 CLI requests/month',
            '3 web projects',
            '100 chat messages/day',
            '200 extension suggestions/day',
            '100MB storage'
          ]
        },
        {
          name: 'PRO',
          display_name: 'Pro',
          price: 20,
          features: [
            '1,000 CLI requests/month',
            '20 web projects',
            '1,000 chat messages/day',
            '2,000 extension suggestions/day',
            '1GB storage',
            'Priority support'
          ]
        },
        {
          name: 'ENTERPRISE',
          display_name: 'Enterprise',
          price: 99,
          features: [
            'Unlimited CLI requests',
            'Unlimited web projects',
            'Unlimited chat messages',
            'Unlimited extension suggestions',
            '10GB storage',
            '24/7 priority support',
            'Custom integrations'
          ]
        }
      ]
    });
  } catch (error) {
    console.error('Subscription GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    
    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { plan } = await request.json();
    
    if (!['FREE', 'PRO', 'ENTERPRISE'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan type' },
        { status: 400 }
      );
    }

    // For now, we'll allow plan changes without payment
    // TODO: Integrate with payment provider (Wise)
    const success = await userManager.changePlan(user.id, plan as PlanType);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to change plan' },
        { status: 500 }
      );
    }

    // Return updated subscription info
    const profile = await userManager.getUserProfile(user.id);
    
    return NextResponse.json({
      plan: profile?.subscription_plan,
      subscription_status: profile?.subscription_status,
      changed_at: new Date().toISOString(),
      message: `Successfully upgraded to ${plan} plan`
    });
  } catch (error) {
    console.error('Plan change error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}