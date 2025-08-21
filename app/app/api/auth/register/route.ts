/**
 * CLI Registration API Route
 * Handles new user registration from CLI
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

interface UserSession {
  userId: string;
  token: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
  quotas: {
    totalRequests: number;
    usedRequests: number;
    resetDate: string;
  };
  platforms: {
    cli: boolean;
    web: boolean;
    extension: boolean;
    router: boolean;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: RegisterRequest = await request.json();

    if (!body.email || !body.password || !body.name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // For now, create a mock session
    // In production, this would create user in database
    const newUserSession: UserSession = {
      userId: 'new-user-' + Date.now(),
      token: jwt.sign({ 
        userId: 'new-user-' + Date.now(),
        email: body.email,
        name: body.name,
        plan: 'free'
      }, process.env.NEXTAUTH_SECRET || 'development-secret', { expiresIn: '7d' }),
      email: body.email,
      plan: 'free',
      quotas: {
        totalRequests: 1000,
        usedRequests: 0,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      platforms: {
        cli: true,
        web: true,
        extension: false,
        router: false
      }
    };

    return NextResponse.json({
      success: true,
      user: newUserSession
    });

  } catch (error) {
    console.error('CLI Registration Error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}