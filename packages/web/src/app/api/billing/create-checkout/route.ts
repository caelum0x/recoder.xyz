import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import jwt from 'jsonwebtoken'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_...', {
  apiVersion: '2024-12-18.acacia'
})

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// Price IDs for each plan (set these up in Stripe Dashboard)
const PRICE_IDS = {
  premium: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_premium_monthly',
  pro: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly'
}

export async function POST(request: NextRequest) {
  try {
    const { priceId, planType } = await request.json()
    
    // Get user from authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'Authorization required' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    // Validate plan type and price ID
    if (!['premium', 'pro'].includes(planType) || !PRICE_IDS[planType as keyof typeof PRICE_IDS]) {
      return NextResponse.json(
        { message: 'Invalid plan type' },
        { status: 400 }
      )
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId || PRICE_IDS[planType as keyof typeof PRICE_IDS],
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
      customer_email: decoded.email,
      metadata: {
        userId: decoded.userId,
        planType,
      },
      subscription_data: {
        metadata: {
          userId: decoded.userId,
          planType,
        },
      },
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url
    })
  } catch (error: any) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { message: 'Failed to create checkout session', error: error.message },
      { status: 500 }
    )
  }
}