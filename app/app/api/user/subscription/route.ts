// User subscription management endpoint
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import { PlanType } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const profile = await userManager.getUserProfile(session.user.id);
    
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      plan: profile.plan,
      subscription_status: profile.subscription_status,
      subscription_ends_at: profile.subscription_ends_at,
      usage_stats: profile.usage_stats,
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
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
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
    const success = await userManager.changePlan(session.user.id, plan as PlanType);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to change plan' },
        { status: 500 }
      );
    }

    // Return updated subscription info
    const profile = await userManager.getUserProfile(session.user.id);
    
    return NextResponse.json({
      plan: profile?.plan,
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