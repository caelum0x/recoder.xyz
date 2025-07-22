import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'

// Temporary store for CLI auth codes (in production, use Redis or database)
const authCodes = new Map()
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { message: 'User ID is required' },
        { status: 400 }
      )
    }

    // Generate a unique auth code
    const authCode = uuidv4()
    
    // Store the code with user info (expires in 5 minutes)
    authCodes.set(authCode, {
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    })

    // Clean up expired codes (simple cleanup)
    for (const [code, data] of authCodes.entries()) {
      if (Date.now() > data.expiresAt) {
        authCodes.delete(code)
      }
    }

    return NextResponse.json({
      code: authCode,
      expiresIn: 300 // 5 minutes
    })
  } catch (error) {
    console.error('Auth code generation error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}