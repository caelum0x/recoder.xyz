import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const users = new Map() // Same user store
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'Authorization header required' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    const { tokensUsed, requestsUsed } = await request.json()
    
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

    // Initialize usage if not exists
    if (!user.usage) {
      const limits = user.plan === 'premium' 
        ? { tokens: 2000000, requests: 10000 }
        : user.plan === 'pro'
        ? { tokens: 10000000, requests: 50000 }
        : { tokens: 0, requests: 0 }

      user.usage = {
        tokensUsed: 0,
        requestsUsed: 0,
        tokensLimit: limits.tokens,
        requestsLimit: limits.requests,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    }

    // Update usage
    if (typeof tokensUsed === 'number' && tokensUsed > 0) {
      user.usage.tokensUsed = (user.usage.tokensUsed || 0) + tokensUsed
    }
    
    if (typeof requestsUsed === 'number' && requestsUsed > 0) {
      user.usage.requestsUsed = (user.usage.requestsUsed || 0) + requestsUsed
    }

    // Check if reset date has passed
    const resetDate = new Date(user.usage.resetDate)
    if (resetDate < new Date()) {
      // Reset usage for new month
      user.usage.tokensUsed = tokensUsed || 0
      user.usage.requestsUsed = requestsUsed || 0
      user.usage.resetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }

    return NextResponse.json({
      message: 'Usage updated successfully',
      usage: user.usage
    })
  } catch (error) {
    console.error('Update usage error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}