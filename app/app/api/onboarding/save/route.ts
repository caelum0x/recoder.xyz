/**
 * Save Onboarding Data API
 * Saves user onboarding preferences and setup data
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const data = await request.json();
    const {
      role,
      company,
      teamSize,
      useCase,
      experience,
      primaryUseCase,
      experienceLevel,
      preferredModels,
      wantsCliSetup,
      plan,
      onboardingCompleted
    } = data;

    const profile = {
      role: role || undefined,
      company: company || undefined,
      teamSize: teamSize || undefined,
      useCase: useCase || primaryUseCase || undefined,
      experience: experience || experienceLevel || undefined,
      plan: plan || 'free',
      wantsCliSetup: wantsCliSetup || false,
    };

    const isCompleted = onboardingCompleted !== false;

    // Update user with onboarding data
    await prisma.users.update({
      where: { id: session.user.id },
      data: {
        preferredModels: preferredModels || [],
        onboardingStep: isCompleted ? 'completed' : 'in_progress',
        onboardingProfile: profile,
        ...(isCompleted ? { onboardingCompletedAt: new Date() } : {}),
        updatedAt: new Date()
      }
    });

    const jsonResponse = NextResponse.json({
      success: true,
      message: 'Onboarding data saved successfully',
      data: {
        onboardingCompleted: isCompleted,
        profile,
        preferredModels,
      },
    });

    // Set edge-readable cookie so middleware can skip the onboarding check
    if (isCompleted) {
      jsonResponse.cookies.set('onboarding_completed', '1', {
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
        httpOnly: true,
        sameSite: 'lax',
      });
    }

    return jsonResponse;
  } catch (error) {
    logger.error('Onboarding save error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { 
        error: 'Failed to save onboarding data'
      },
      { status: 500 }
    );
  }
}

// Get onboarding status
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingStep: true,
        onboardingProfile: true,
        onboardingCompletedAt: true,
        preferredModels: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      onboardingCompleted: user.onboardingStep === 'completed',
      data: {
        profile: user.onboardingProfile,
        preferredModels: user.preferredModels,
        completedAt: user.onboardingCompletedAt
      }
    });
  } catch (error) {
    logger.error('Onboarding status error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { 
        error: 'Failed to get onboarding status'
      },
      { status: 500 }
    );
  }
}
