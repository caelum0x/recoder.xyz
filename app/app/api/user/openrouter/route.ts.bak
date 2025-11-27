/**
 * OpenRouter API Key Management
 * For saving user's own OpenRouter API keys (free plan)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptApiKey } from '@/lib/crypto';
import { validateUserApiKey } from '@/lib/api-key-resolver';

export async function POST(request: NextRequest) {
  try {
    const { userId, apiKey, provider = 'openrouter' } = await request.json();

    if (!userId || !apiKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate API key works
    const validation = await validateUserApiKey(apiKey, provider);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Encrypt API key
    const encrypted = encryptApiKey(apiKey);

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        openRouterApiKey: encrypted,
        hasOwnApiKey: true,
        apiKeyEncrypted: true,
        onboardingStep: 'completed',
      },
    });

    return NextResponse.json({ 
      success: true,
      message: 'OpenRouter API key saved successfully'
    });
  } catch (error: any) {
    console.error('Save OpenRouter API key error:', error);
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to get API key status' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        openRouterApiKey: null,
        hasOwnApiKey: false,
        apiKeyEncrypted: false,
      },
    });

    return NextResponse.json({ 
      success: true,
      message: 'OpenRouter API key removed successfully'
    });
  } catch (error: any) {
    console.error('Delete API key error:', error);
    return NextResponse.json({ error: 'Failed to remove API key' }, { status: 500 });
  }
}
