import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// This would typically connect to your database
// For demo purposes, we'll use a simple in-memory store
const users = new Map()

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email and password are required' },
        { status: 400 }
      )
    }

    // In a real app, you would query your database
    const user = users.get(email)
    
    if (!user) {
      return NextResponse.json(
        { message: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const isValidPassword = await bcrypt.compare(password, user.hashedPassword)
    
    if (!isValidPassword) {
      return NextResponse.json(
        { message: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        plan: user.plan 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
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
      message: 'Login successful',
      user: userResponse,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}