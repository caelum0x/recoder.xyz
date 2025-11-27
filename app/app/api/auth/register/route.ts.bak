/**
 * User Registration API Route
 * Handles new user registration with database persistence
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/crypto';
import { getPlanLimits } from '@/lib/plan-config';
import { sendWelcomeEmail } from '@/lib/email';

interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  plan?: 'free' | 'pro' | 'enterprise';
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

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(body.password);

    // Determine plan
    const plan = body.plan || 'free';

    // Create user
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        subscriptionPlan: plan,
        subscriptionStatus: 'active',
        emailVerified: false,
      },
    });

    // Create initial quota based on schema
    const planLimits = getPlanLimits(plan);
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Map plan limits to quota fields
    let tokensPerSession = 10000; // Default for free
    if (plan === 'pro') tokensPerSession = 100000; // 100K for pro
    else if (plan === 'enterprise') tokensPerSession = 500000; // 500K for enterprise
    
    await prisma.userQuota.create({
      data: {
        userId: user.id,
        sessionsPerDay: planLimits.sessionsPerDay || 6,
        sessionsUsedToday: 0,
        tokensPerSession: tokensPerSession,
        periodStart: now,
        periodEnd: endOfDay,
        lastResetAt: now,
      },
    });

    // Determine if onboarding is needed (free users need to add API key)
    const needsOnboarding = planLimits.requiresOwnApiKey;

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user.email, user.name).catch(err => 
      console.error('Failed to send welcome email:', err)
    );

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.subscriptionPlan,
        needsApiKey: needsOnboarding,
        onboardingUrl: needsOnboarding ? `/auth/onboarding?userId=${user.id}` : null,
      },
      message: needsOnboarding 
        ? 'Registration successful. Please add your OpenRouter API key to continue.' 
        : 'Registration successful!'
    });

  } catch (error) {
    console.error('Registration Error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}