import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_...', {
  apiVersion: '2024-12-18.acacia'
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_...'

// This would typically connect to your database
const users = new Map() // Same user store from other endpoints

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { message: 'No Stripe signature' },
        { status: 400 }
      )
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (error) {
      console.error('Webhook signature verification failed:', error)
      return NextResponse.json(
        { message: 'Webhook signature verification failed' },
        { status: 400 }
      )
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { message: 'Webhook handler error', error: error.message },
      { status: 500 }
    )
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Checkout completed:', session.id)
  
  const userId = session.metadata?.userId
  const planType = session.metadata?.planType

  if (!userId || !planType) {
    console.error('Missing metadata in checkout session')
    return
  }

  // Find user and update their subscription
  let user = null
  for (const userData of users.values()) {
    if (userData.id === userId) {
      user = userData
      break
    }
  }

  if (!user) {
    console.error('User not found:', userId)
    return
  }

  // Update user plan and reset usage
  user.plan = planType
  user.stripeCustomerId = session.customer
  user.stripeSubscriptionId = session.subscription
  user.subscriptionStatus = 'active'
  user.planUpdatedAt = new Date().toISOString()

  // Reset usage for new plan
  const limits = getPlanLimits(planType)
  user.usage = {
    tokensUsed: 0,
    requestsUsed: 0,
    tokensLimit: limits.tokens,
    requestsLimit: limits.requests,
    resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }

  console.log(`User ${user.email} upgraded to ${planType}`)
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('Subscription created:', subscription.id)
  
  const userId = subscription.metadata?.userId
  const planType = subscription.metadata?.planType

  if (!userId) return

  let user = null
  for (const userData of users.values()) {
    if (userData.id === userId) {
      user = userData
      break
    }
  }

  if (user) {
    user.stripeSubscriptionId = subscription.id
    user.subscriptionStatus = subscription.status
    user.plan = planType || 'premium'
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Subscription updated:', subscription.id)
  
  // Find user by subscription ID
  let user = null
  for (const userData of users.values()) {
    if (userData.stripeSubscriptionId === subscription.id) {
      user = userData
      break
    }
  }

  if (user) {
    user.subscriptionStatus = subscription.status
    
    // Handle plan changes
    if (subscription.items.data.length > 0) {
      const priceId = subscription.items.data[0].price.id
      
      // Map price ID to plan type (you'd store this mapping in your database)
      const planMapping = {
        [process.env.STRIPE_PREMIUM_PRICE_ID || 'price_premium_monthly']: 'premium',
        [process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly']: 'pro'
      }
      
      const newPlan = planMapping[priceId as keyof typeof planMapping]
      if (newPlan && newPlan !== user.plan) {
        user.plan = newPlan
        
        // Reset usage for plan change
        const limits = getPlanLimits(newPlan)
        user.usage = {
          tokensUsed: 0,
          requestsUsed: 0,
          tokensLimit: limits.tokens,
          requestsLimit: limits.requests,
          resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }
        
        console.log(`User ${user.email} plan changed to ${newPlan}`)
      }
    }
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Subscription deleted:', subscription.id)
  
  // Find user by subscription ID
  let user = null
  for (const userData of users.values()) {
    if (userData.stripeSubscriptionId === subscription.id) {
      user = userData
      break
    }
  }

  if (user) {
    user.plan = 'free'
    user.subscriptionStatus = 'canceled'
    user.stripeSubscriptionId = null
    
    // Reset to free plan limits
    user.usage = {
      tokensUsed: 0,
      requestsUsed: 0,
      tokensLimit: 0,
      requestsLimit: 0,
      resetDate: new Date().toISOString()
    }
    
    console.log(`User ${user.email} downgraded to free plan`)
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Payment succeeded:', invoice.id)
  
  const subscriptionId = invoice.subscription as string
  
  // Find user by subscription ID and update last payment
  let user = null
  for (const userData of users.values()) {
    if (userData.stripeSubscriptionId === subscriptionId) {
      user = userData
      break
    }
  }

  if (user) {
    user.lastPaymentDate = new Date().toISOString()
    user.subscriptionStatus = 'active'
    
    // Reset usage for new billing period if it's a monthly renewal
    const billingPeriodStart = new Date(invoice.period_start * 1000)
    const now = new Date()
    
    if (billingPeriodStart.getMonth() !== user.usage?.resetDate ? new Date(user.usage.resetDate).getMonth() : -1) {
      const limits = getPlanLimits(user.plan)
      user.usage = {
        tokensUsed: 0,
        requestsUsed: 0,
        tokensLimit: limits.tokens,
        requestsLimit: limits.requests,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
      
      console.log(`Usage reset for ${user.email} - new billing period`)
    }
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Payment failed:', invoice.id)
  
  const subscriptionId = invoice.subscription as string
  
  // Find user and handle payment failure
  let user = null
  for (const userData of users.values()) {
    if (userData.stripeSubscriptionId === subscriptionId) {
      user = userData
      break
    }
  }

  if (user) {
    user.subscriptionStatus = 'past_due'
    user.lastFailedPayment = new Date().toISOString()
    
    // Could implement grace period logic here
    console.log(`Payment failed for ${user.email}`)
  }
}

function getPlanLimits(plan: string) {
  const limits = {
    free: { tokens: 0, requests: 0 },
    premium: { tokens: 400000, requests: 5000 }, // 400K tokens, 5K requests
    pro: { tokens: 2000000, requests: 25000 }, // 2M tokens, 25K requests
    enterprise: { tokens: -1, requests: -1 } // Unlimited
  }

  return limits[plan as keyof typeof limits] || limits.free
}