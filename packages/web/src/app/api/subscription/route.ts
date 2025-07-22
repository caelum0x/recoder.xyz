import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const users = new Map() // Same user store
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

function getFeaturesByPlan(plan: string): string[] {
  const features = {
    free: [
      'Local AI models (Ollama)',
      'Basic CLI functionality', 
      'Community support',
      'Open source templates'
    ],
    premium: [
      'All Free features',
      'Cloud AI models (Claude, GPT, Gemini, Groq)',
      'Production engine access',
      '2M tokens/month',
      '10K requests/month',
      'Priority support',
      'Advanced templates'
    ],
    pro: [
      'All Premium features',
      '10M tokens/month (5x more)',
      '50K requests/month (5x more)',
      'Team collaboration',
      'Custom integrations',
      'Phone support'
    ],
    enterprise: [
      'Unlimited usage',
      'On-premise deployment',
      'Custom AI models',
      'SLA guarantees',
      'Dedicated support',
      'White-label options'
    ]
  }

  return features[plan as keyof typeof features] || features.free
}

function getUserLimits(plan: string) {
  const limits = {
    free: { tokens: 0, requests: 0 },
    premium: { tokens: 2000000, requests: 10000 },
    pro: { tokens: 10000000, requests: 50000 },
    enterprise: { tokens: -1, requests: -1 } // Unlimited
  }

  return limits[plan as keyof typeof limits] || limits.free
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'Authorization header required' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    
    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return NextResponse.json(
        { message: 'Invalid or expired token' },
        { status: 401 }
      )
    }

    // Find user
    let user = null
    for (const userData of users.values()) {
      if (userData.id === decoded.userId) {
        user = userData
        break
      }
    }

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      )
    }

    const limits = getUserLimits(user.plan)
    const features = getFeaturesByPlan(user.plan)

    // Ensure user has usage data
    if (!user.usage) {
      user.usage = {
        tokensUsed: 0,
        requestsUsed: 0,
        tokensLimit: limits.tokens,
        requestsLimit: limits.requests,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    }

    const subscription = {
      id: user.id,
      plan: user.plan,
      isActive: true, // All plans are active in this demo
      expiresAt: user.plan === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      usage: {
        tokensUsed: user.usage.tokensUsed || 0,
        requestsUsed: user.usage.requestsUsed || 0,
        tokensLimit: limits.tokens,
        requestsLimit: limits.requests,
        resetDate: user.usage.resetDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      features,
      user: {
        email: user.email
      }
    }

    return NextResponse.json(subscription)
  } catch (error) {
    console.error('Get subscription error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}