/**
 * User Login API Route
 * Handles login requests with database validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/crypto';
import { getApiKeyStatus } from '@/lib/api-key-resolver';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { trackServerEvent, AnalyticsEvents } from '@/lib/analytics';
import { traceRequest } from '@/lib/tracing-middleware';
import { z } from 'zod';
import { getCommercialEntitlements, normalizeCommercialPlan } from '@/lib/plan-entitlements';
import { formatCommercialQuotaResponse } from '@/lib/commercial-quota';

const authRateLimiter = rateLimit(rateLimitConfigs.auth);

const loginSchema = z.object({
  email: z.string().email('Invalid email format').max(255).toLowerCase().trim(),
  password: z.string().min(1, 'Password is required').max(256),
});

export async function POST(request: NextRequest) {
  const { traceId, applyTraceId, log } = traceRequest(request);

  try {
    // Rate limit: 5 requests per minute
    const rateLimitResponse = await authRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const rawBody = await request.json();
    const parsed = loginSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // Find user with quota (singular relation)
    const user = await prisma.users.findUnique({
      where: { email: body.email },
      include: {
        quota: true
      }
    });

    if (!user || !user.password) {
      trackServerEvent(AnalyticsEvents.LOGIN_FAILED, {
        reason: 'invalid_credentials',
        source: 'email',
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(body.password, user.password);
    if (!isValidPassword) {
      trackServerEvent(AnalyticsEvents.LOGIN_FAILED, {
        reason: 'invalid_password',
        userId: user.id,
        source: 'email',
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return NextResponse.json(
        {
          error: 'Please verify your email before signing in. Check your inbox for the verification link.',
          emailNotVerified: true,
          email: user.email
        },
        { status: 403 }
      );
    }

    // Check if 2FA is enabled. Some production databases may not have
    // the legacy `security_settings` table yet, so treat it as disabled.
    let has2FA = false;
    try {
      const securitySettings = await prisma.$queryRaw<any[]>`
        SELECT two_factor_enabled FROM security_settings WHERE user_id = ${user.id}
      `;
      has2FA = Boolean(
        securitySettings &&
        securitySettings.length > 0 &&
        securitySettings[0]?.two_factor_enabled
      );
    } catch (error) {
      logger.warn('security_settings table unavailable; defaulting 2FA to disabled', {
        route: 'auth/login',
        userId: user.id,
        error: String(error),
      });
    }

    // If 2FA is enabled, require 2FA verification
    if (has2FA) {
      return NextResponse.json({
        success: false,
        requires2FA: true,
        userId: user.id,
        message: 'Two-factor authentication required'
      }, { status: 200 });
    }

    // Generate JWT token for session
    const jwtToken = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        name: user.name
      },
      (() => {
        const secret = process.env.JWT_SECRET;
        if (!secret && process.env.NODE_ENV === 'production') {
          throw new Error('JWT_SECRET must be set in production');
        }
        return secret || 'dev-jwt-secret-not-for-production';
      })(),
      { expiresIn: '30d' }
    );

    // Generate access and refresh tokens for CLI
    const accessToken = `rct_${nanoid(32)}`;
    const refreshToken = `rcr_${nanoid(32)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create CLI session
    await prisma.cli_sessions.create({
      data: {
        id: nanoid(),
        userId: user.id,
        deviceName: 'Web Browser',
        deviceType: 'web',
        accessToken,
        refreshToken,
        expiresAt,
        isActive: true,
      },
    });

    // Update last login
    await prisma.users.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Track successful login
    trackServerEvent(AnalyticsEvents.LOGIN_COMPLETED, {
      method: 'email',
      userId: user.id,
      plan: user.subscription ?? undefined,
    });

    // Get API key status
    const apiKeyStatus = await getApiKeyStatus(user.id);

    // Get quota info (quota is now a single object, not array)
    const quota = user.quota || null;
    const normalizedPlan = normalizeCommercialPlan(user.subscriptionPlan || user.subscription || 'free');
    const entitlements = getCommercialEntitlements(normalizedPlan);
    const quotaResponse = quota ? formatCommercialQuotaResponse(quota, normalizedPlan) : null;

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: normalizedPlan,
        entitlements,
        apiKeyStatus,
        quota: quotaResponse ? {
          remaining: quotaResponse.legacy.remaining,
          limit: quotaResponse.legacy.limit,
          tokensPerSession: quotaResponse.legacy.tokensPerSession,
          resetDate: quota.periodEnd.toISOString()
        } : null
      },
      session: {
        accessToken,
        refreshToken,
        expiresAt: expiresAt.toISOString()
      }
    });

    // Set JWT token as HTTP-only cookie
    // IMPORTANT: domain must be .recoder.xyz for cross-subdomain sharing with web.recoder.xyz
    response.cookies.set('auth-token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? '.recoder.xyz' : undefined,
    });

    return applyTraceId(response);

  } catch (error) {
    log.error('Login Error:', { error: String(error), route: 'auth/login' });
    return applyTraceId(
      NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      )
    );
  }
}
