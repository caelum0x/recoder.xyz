/**
 * User Registration API Route
 * Handles new user registration with database persistence
 * Sends verification email to confirm email ownership
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/crypto';
import { getPlanLimits } from '@/lib/plan-config';
import { sendVerificationEmail } from '@/lib/email';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

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
    const existingUser = await prisma.users.findUnique({
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
    const user = await prisma.users.create({
      data: {
        id: nanoid(),
        email: body.email,
        name: body.name,
        password: passwordHash,
        subscription: plan,
        emailVerified: false,
        updatedAt: new Date(),
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
    
    await prisma.user_quota.create({
      data: {
        id: nanoid(),
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

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store verification token
    await prisma.verifications.create({
      data: {
        id: crypto.randomUUID(),
        identifier: `email-verify:${user.email}`,
        value: hashedToken,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      }
    });

    // Build verification URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

    // Send verification email (non-blocking)
    sendVerificationEmail(user.email, verificationUrl).catch(err =>
      logger.error('Failed to send verification email', { route: 'api/auth/register', error: err instanceof Error ? err.message : String(err) })
    );

    logger.info('Verification email sent', { route: 'api/auth/register', email: user.email });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.subscription,
        needsApiKey: needsOnboarding,
        emailVerified: false,
      },
      message: 'Registration successful! Please check your email to verify your account.',
      requiresVerification: true,
    });

  } catch (error) {
    logger.error('Registration error', { route: 'api/auth/register', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}