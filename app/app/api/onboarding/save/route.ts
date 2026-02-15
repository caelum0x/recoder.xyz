/**
 * Save Onboarding Data API
 * Saves user onboarding preferences and setup data
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

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
      primaryUseCase,
      experienceLevel,
      preferredModels,
      wantsCliSetup,
      onboardingCompleted
    } = data;

    // Update user with onboarding data
    await prisma.users.update({
      where: { id: session.user.id },
      data: {
        preferredModels: preferredModels || [],
        onboardingStep: onboardingCompleted ? 'completed' : 'in_progress',
        updatedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Onboarding data saved successfully',
      data: {
        onboardingCompleted: true,
        primaryUseCase,
        experienceLevel,
        preferredModels,
        wantsCliSetup
      },
    });
  } catch (error) {
    console.error('Onboarding save error:', error);
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
        preferredModels: user.preferredModels
      }
    });
  } catch (error) {
    console.error('Onboarding status error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get onboarding status'
      },
      { status: 500 }
    );
  }
}
