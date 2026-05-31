/**
 * Email Signup API Route
 * Creates account and sends temporary password via email
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmailProviderStatus, sendTemporaryPasswordEmail } from '@/lib/email';
import { scheduleOnboardingEmails } from '@/lib/services/onboarding-email.service';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { trackServerEvent, AnalyticsEvents } from '@/lib/analytics';
import { extractAttribution } from '@/lib/attribution';
import { generateReferralCode } from '@/lib/referral';
import { buildCommercialQuotaCreateData } from '@/lib/commercial-quota';

const authRateLimiter = rateLimit(rateLimitConfigs.auth);

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 requests per minute
    const rateLimitResponse = await authRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { email, name } = body;

    if (!email || !name) {
      return NextResponse.json(
        { success: false, error: 'Email and name are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.users.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Generate temporary password (8 characters, alphanumeric)
    const tempPassword = crypto.randomBytes(4).toString('hex') + 
                        crypto.randomInt(1000, 9999).toString();
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const attribution = extractAttribution(request, body);

    // Create user account
    // emailVerified: true because receiving the temp password proves email ownership
    const user = await prisma.users.create({
      data: {
        id: crypto.randomUUID(),
        email,
        name,
        password: hashedPassword,
        emailVerified: true, // Temp password email proves ownership
        subscription: 'free',
        role: 'user',
        isActive: true,
        referralCode: generateReferralCode(email),
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
      }
    });

    await prisma.user_quota.create({
      data: buildCommercialQuotaCreateData(user.id, 'free', 'day'),
    });

    // Send temporary password email
    const emailResult = await sendTemporaryPasswordEmail(email, tempPassword);

    // Schedule onboarding email sequence (welcome + day 1/3/7 emails)
    // Runs in background - never blocks the signup response
    scheduleOnboardingEmails(user.id, email, name).catch((err) =>
      logger.error('Failed to schedule onboarding emails', {
        email,
        error: err instanceof Error ? err.message : String(err),
        route: 'auth/signup-email',
      })
    );

    logger.info('Account created, temp password sent, onboarding scheduled', { email, route: 'auth/signup-email' });

    // Track successful signup
    trackServerEvent(AnalyticsEvents.SIGNUP_COMPLETED, {
      method: 'email',
      userId: user.id,
      plan: 'free',
      source: attribution.acquisitionSource,
    });

    // Lead -> signup conversion: if this email was captured as a lead, link it
    // to the new user and record the conversion. Best-effort; never blocks signup.
    try {
      const lead = await prisma.newsletter_subscribers.findUnique({
        where: { email },
        select: { id: true, source: true, userId: true },
      });
      if (lead) {
        if (!lead.userId) {
          await prisma.newsletter_subscribers.update({
            where: { id: lead.id },
            data: { userId: user.id, updatedAt: new Date() },
          });
        }
        trackServerEvent(AnalyticsEvents.LEAD_CONVERTED_TO_SIGNUP, {
          method: 'email',
          userId: user.id,
          leadSource: lead.source ?? undefined,
          matchedExistingUser: Boolean(lead.userId),
        });
      }
    } catch (conversionError) {
      logger.warn('Lead-to-signup conversion tracking failed', {
        route: 'auth/signup-email',
        error: conversionError instanceof Error ? conversionError.message : String(conversionError),
      });
    }

    // In development, include the temp password for testing
    const isDev = process.env.NODE_ENV === 'development';
    const showTestData = isDev || process.env.SHOW_TEST_CREDENTIALS === 'true';

    return NextResponse.json({
      success: true,
      message: 'Account created successfully! Check your email for your temporary password and welcome message.',
      email,
      emailSent: emailResult.success,
      emailProvider: getEmailProviderStatus().provider,
      // Include temp password in dev mode for testing
      ...(showTestData && {
        _dev: {
          tempPassword,
          note: 'This is only shown in development mode for testing'
        }
      })
    });

  } catch (error) {
    logger.error('Email signup error:', { error: String(error), route: 'auth/signup-email' });
    return NextResponse.json(
      { success: false, error: 'Failed to create account. Please try again.' },
      { status: 500 }
    );
  }
}
