/**
 * API Key Management Route (Onboarding)
 * Handles saving OpenRouter API key for the user during onboarding
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ensureAppUserFromAuthUser } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key is required' },
        { status: 400 }
      );
    }

    // Ensure app user exists
    const appUser = await ensureAppUserFromAuthUser(user);

    // Save the OpenRouter API key to the user record
    await prisma.users.update({
      where: { id: appUser?.id || user.id },
      data: {
        openRouterApiKey: apiKey,
        hasOwnApiKey: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding API key:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add API key' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const appUser = await ensureAppUserFromAuthUser(user);

    await prisma.users.update({
      where: { id: appUser?.id || user.id },
      data: {
        openRouterApiKey: null,
        hasOwnApiKey: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}
