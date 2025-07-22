import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

// Import the same auth codes store (in production, use shared storage)
// This would typically be in a shared module or database
const authCodes = new Map()
const users = new Map() // Same user store as login/register

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function POST(request: NextRequest) {
  try {
    const { code, clientId } = await request.json()

    if (!code || !clientId) {
      return NextResponse.json(
        { message: 'Code and client ID are required' },
        { status: 400 }
      )
    }

    if (clientId !== 'recoder-cli') {
      return NextResponse.json(
        { message: 'Invalid client ID' },
        { status: 400 }
      )
    }

    // Get auth code data
    const codeData = authCodes.get(code)
    
    if (!codeData) {
      return NextResponse.json(
        { message: 'Invalid or expired auth code' },
        { status: 400 }
      )
    }

    // Check if code is expired
    if (Date.now() > codeData.expiresAt) {
      authCodes.delete(code)
      return NextResponse.json(
        { message: 'Auth code has expired' },
        { status: 400 }
      )
    }

    // Find user by ID
    let user = null
    for (const userData of users.values()) {
      if (userData.id === codeData.userId) {
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

    // Delete the used code
    authCodes.delete(code)

    // Generate tokens
    const accessToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        plan: user.plan 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    const refreshToken = jwt.sign(
      { 
        userId: user.id,
        type: 'refresh' 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // Update last login
    user.lastLogin = new Date().toISOString()

    const userResponse = {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      plan: user.plan,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }

    return NextResponse.json({
      accessToken,
      refreshToken,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
      user: userResponse
    })
  } catch (error) {
    console.error('Token exchange error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}