/**
 * User Registration API Route
 * Handles new user registration with database persistence
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/crypto';
import { getPlanLimits } from '@/lib/plan-config';

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

    // Create initial quota
    const planLimits = getPlanLimits(plan);
    await prisma.userQuota.create({
      data: {
        userId: user.id,
        requestsLimit: planLimits.monthlyRequests === -1 ? 999999999 : planLimits.monthlyRequests,
        requestsUsed: 0,
        tokensLimit: BigInt(planLimits.tokensPerMonth === -1 ? 999999999 : planLimits.tokensPerMonth),
        tokensUsed: BigInt(0),
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Determine if onboarding is needed (free users need to add API key)
    const needsOnboarding = planLimits.requiresOwnApiKey;

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