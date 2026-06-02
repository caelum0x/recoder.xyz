/**
 * User Registration API Route
 * Handles new user registration with database persistence
 * Sends verification email to confirm email ownership
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/crypto';
import { buildCommercialQuotaCreateData, getCommercialQuotaConfig } from '@/lib/commercial-quota';
import { resolvePublicAppUrl, sendVerificationEmail } from '@/lib/email';
import { scheduleOnboardingEmails } from '@/lib/services/onboarding-email.service';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { extractAttribution } from '@/lib/attribution';
import { generateReferralCode } from '@/lib/referral';
import { createVerificationRecord } from '@/lib/auth/verification-store';
import { validatePassword } from '@/lib/password-validation';
import { z } from 'zod';

const authRateLimiter = rateLimit(rateLimitConfigs.auth);

const registerSchema = z.object({
  email: z.string().email('Invalid email format').max(255).toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(256),
  name: z.string().min(1, 'Name is required').max(100).trim(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 requests per minute
    const rateLimitResponse = await authRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const rawBody = await request.json();
    const parsed = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // Validate password strength
    const validation = validatePassword(body.password);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors[0] || 'Password is too weak', errors: validation.errors },
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

    const attribution = extractAttribution(request, body as unknown as Record<string, unknown>);

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
        referralCode: generateReferralCode(body.email),
        referredByCode: attribution.referredByCode ?? undefined,
        utmSource: attribution.utmSource ?? undefined,
        utmMedium: attribution.utmMedium ?? undefined,
        utmCampaign: attribution.utmCampaign ?? undefined,
        utmTerm: attribution.utmTerm ?? undefined,
        utmContent: attribution.utmContent ?? undefined,
        firstTouchReferrer: attribution.firstTouchReferrer ?? undefined,
        firstTouchLanding: attribution.firstTouchLanding ?? undefined,
        acquisitionSource: attribution.acquisitionSource,
        updatedAt: new Date(),
      },
    });

    // Better Auth email sign-in expects a credential account row.
    // Without this, users created via /api/auth/register cannot log in with signIn.email().
    await prisma.accounts.create({
      data: {
        id: nanoid(),
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: passwordHash,
        updatedAt: new Date(),
      },
    });

    await prisma.user_quota.create({
      data: buildCommercialQuotaCreateData(user.id, plan, 'day'),
    });

    // Determine if onboarding is needed (free users need to add API key)
    const needsOnboarding = getCommercialQuotaConfig(plan).entitlements.workspaces <= 1;

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store verification token in both compatibility tables
    await createVerificationRecord(`email-verify:${user.email}`, verificationToken, expiresAt);

    // Build verification URL
    const baseUrl = resolvePublicAppUrl();
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

    // Send verification email (non-blocking)
    sendVerificationEmail(user.email, verificationUrl).catch(err =>
      logger.error('Failed to send verification email', { route: 'api/auth/register', error: err instanceof Error ? err.message : String(err) })
    );

    // Schedule onboarding email sequence (welcome + day 1/3/7 emails)
    scheduleOnboardingEmails(user.id, user.email, user.name).catch(err =>
      logger.error('Failed to schedule onboarding emails', { route: 'api/auth/register', error: err instanceof Error ? err.message : String(err) })
    );

    logger.info('Registration complete, verification and onboarding emails scheduled', { route: 'api/auth/register', email: user.email });

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
