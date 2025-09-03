import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Perfect for getting started',
    price_monthly: 0,
    price_yearly: 0,
    limits: {
      projects: 3,
      deployments: 5,
      bandwidth_gb: 1,
      storage_gb: 1,
      team_members: 1,
      ai_generations: 10
    },
    features: [
      '3 Projects',
      '5 Deployments',
      '1GB Storage',
      '1GB Bandwidth',
      'Community Support'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For professional developers',
    price_monthly: 29,
    price_yearly: 290,
    limits: {
      projects: 25,
      deployments: 100,
      bandwidth_gb: 50,
      storage_gb: 10,
      team_members: 5,
      ai_generations: 500
    },
    features: [
      'Everything in Free',
      '25 Projects',
      '100 Deployments',
      '10GB Storage',
      '50GB Bandwidth',
      'Priority Support',
      'Advanced Analytics'
    ]
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large teams and organizations',
    price_monthly: 199,
    price_yearly: 1990,
    limits: {
      projects: -1, // Unlimited
      deployments: -1,
      bandwidth_gb: -1,
      storage_gb: -1,
      team_members: -1,
      ai_generations: -1
    },
    features: [
      'Everything in Pro',
      'Unlimited Everything',
      'Custom Integrations',
      'Dedicated Support',
      'SLA Guarantee',
      'Custom Contracts'
    ]
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'plans') {
      return NextResponse.json({
        success: true,
        plans: SUBSCRIPTION_PLANS
      })
    }

    if (action === 'current') {
      // Mock current subscription data
      const currentSubscription = {
        id: 'sub_1234567890',
        plan: SUBSCRIPTION_PLANS.free,
        status: 'active',
        billing_cycle: 'monthly',
        current_period_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        current_period_end: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000),
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      }

      return NextResponse.json({
        success: true,
        subscription: currentSubscription
      })
    }

    return NextResponse.json({
      success: true,
      plans: SUBSCRIPTION_PLANS
    })

  } catch (error) {
    console.error('GET /api/billing/subscriptions error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subscription data' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, plan_id, billing_cycle = 'monthly' } = body

    if (action === 'create_subscription') {
      // Mock subscription creation
      const plan = SUBSCRIPTION_PLANS[plan_id as keyof typeof SUBSCRIPTION_PLANS]
      
      if (!plan) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
      }

      const newSubscription = {
        id: `sub_${Date.now()}`,
        user_id: session.user.id,
        plan,
        billing_cycle,
        status: 'active',
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        created_at: new Date()
      }

      return NextResponse.json({
        success: true,
        subscription: newSubscription,
        message: 'Subscription created successfully'
      })
    }

    if (action === 'update_subscription') {
      // Mock subscription update
      const plan = SUBSCRIPTION_PLANS[plan_id as keyof typeof SUBSCRIPTION_PLANS]
      
      if (!plan) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        message: 'Subscription updated successfully'
      })
    }

    if (action === 'cancel_subscription') {
      // Mock subscription cancellation
      return NextResponse.json({
        success: true,
        message: 'Subscription cancelled successfully'
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('POST /api/billing/subscriptions error:', error)
    return NextResponse.json(
      { error: 'Failed to process subscription request' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subscription_id, updates } = body

    // Mock subscription update
    return NextResponse.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription_id
    })

  } catch (error) {
    console.error('PUT /api/billing/subscriptions error:', error)
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const subscription_id = searchParams.get('subscription_id')

    if (!subscription_id) {
      return NextResponse.json({ error: 'Subscription ID required' }, { status: 400 })
    }

    // Mock subscription deletion
    return NextResponse.json({
      success: true,
      message: 'Subscription deleted successfully'
    })

  } catch (error) {
    console.error('DELETE /api/billing/subscriptions error:', error)
    return NextResponse.json(
      { error: 'Failed to delete subscription' },
      { status: 500 }
    )
  }
}