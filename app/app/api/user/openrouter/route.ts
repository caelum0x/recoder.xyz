/**
 * OpenRouter API Key Management
 * For saving user's own OpenRouter API keys (free plan)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptApiKey } from '@/lib/crypto';
import { validateUserApiKey } from '@/lib/api-key-resolver';
import { ensureAppUserFromAuthUser, requireAuth } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const appUser = await ensureAppUserFromAuthUser(authResult.user);
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { apiKey, provider = 'openrouter' } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const userId = appUser.id;

    // Validate API key works
    const validation = await validateUserApiKey(apiKey, provider);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Encrypt API key
    const encrypted = encryptApiKey(apiKey);

    // Update user
    await prisma.users.update({
      where: { id: userId },
      data: {
        openRouterApiKey: encrypted,
        hasOwnApiKey: true,
        apiKeyEncrypted: 'encrypted',
        onboardingStep: 'completed',
      },
    });

    return NextResponse.json({ 
      success: true,
      message: 'OpenRouter API key saved successfully'
    });
  } catch (error) {
    console.error('Save OpenRouter API key error:', error);
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const appUser = await ensureAppUserFromAuthUser(authResult.user);
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = await prisma.users.findUnique({
      where: { id: appUser.id },
      select: {
        hasOwnApiKey: true,
        openRouterApiKey: true,
        subscriptionPlan: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      hasApiKey: user.hasOwnApiKey,
      keyMasked: user.openRouterApiKey ? `sk-or-...${user.openRouterApiKey.slice(-4)}` : null,
      requiresApiKey: user.subscriptionPlan === 'free',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get API key status' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const appUser = await ensureAppUserFromAuthUser(authResult.user);
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.users.update({
      where: { id: appUser.id },
      data: {
        openRouterApiKey: null,
        hasOwnApiKey: false,
        apiKeyEncrypted: null,
      },
    });

    return NextResponse.json({ 
      success: true,
      message: 'OpenRouter API key removed successfully'
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    return NextResponse.json({ error: 'Failed to remove API key' }, { status: 500 });
  }
}
