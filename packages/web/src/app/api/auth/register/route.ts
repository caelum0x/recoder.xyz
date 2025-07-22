import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

// This would typically connect to your database
// For demo purposes, we'll use a simple in-memory store
const users = new Map()

export async function POST(request: NextRequest) {
  try {
    const { email, password, username } = await request.json()

    if (!email || !password || !username) {
      return NextResponse.json(
        { message: 'Email, password, and username are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: 'Password must be at least 8 characters long' },
        { status: 400 }
      )
    }

    if (username.length < 3) {
      return NextResponse.json(
        { message: 'Username must be at least 3 characters long' },
        { status: 400 }
      )
    }

    // Check if user already exists
    if (users.has(email)) {
      return NextResponse.json(
        { message: 'User with this email already exists' },
        { status: 409 }
      )
    }

    // Check if username is taken
    for (const user of users.values()) {
      if (user.username === username) {
        return NextResponse.json(
          { message: 'Username is already taken' },
          { status: 409 }
        )
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create new user
    const userId = uuidv4()
    const newUser = {
      id: userId,
      email,
      username,
      name: username, // Use username as display name by default
      hashedPassword,
      plan: 'free',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      isVerified: true, // Skip email verification for demo
      usage: {
        tokensUsed: 0,
        requestsUsed: 0,
        tokensLimit: 0, // Free plan has no cloud model limits
        requestsLimit: 0,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    }

    // Store user
    users.set(email, newUser)

    const userResponse = {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      name: newUser.name,
      plan: newUser.plan,
      createdAt: newUser.createdAt,
      lastLogin: newUser.lastLogin
    }

    return NextResponse.json({
      message: 'Account created successfully',
      user: userResponse
    }, { status: 201 })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}