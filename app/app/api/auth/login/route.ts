/**
 * User Login API Route
 * Handles login requests with database validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/crypto';
import { getApiKeyStatus } from '@/lib/api-key-resolver';
import { nanoid } from 'nanoid';

interface LoginRequest {
  email: string;
  password: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: LoginRequest = await request.json();

    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user with quota (singular relation)
    const user = await prisma.users.findUnique({
      where: { email: body.email },
      include: {
        quota: true
      }
    });

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(body.password, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Generate access and refresh tokens
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

    // Get API key status
    const apiKeyStatus = await getApiKeyStatus(user.id);

    // Get quota info (quota is now a single object, not array)
    const quota = user.quota || null;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.subscription,
        apiKeyStatus,
        quota: quota ? {
          remaining: quota.sessionsPerDay - quota.sessionsUsedToday,
          limit: quota.sessionsPerDay,
          tokensPerSession: quota.tokensPerSession,
          resetDate: quota.periodEnd.toISOString()
        } : null
      },
      session: {
        accessToken,
        refreshToken,
        expiresAt: expiresAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}