/**
 * Save Onboarding Data API
 * Saves user onboarding preferences and setup data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
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
      platforms,
      completedAt
    } = data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update user with onboarding data  
    // Store in user table for now until we migrate UserPreferences
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        // Add these fields to User model or store in metadata
        metadata: {
          ...(typeof user.metadata === 'object' ? user.metadata : {}),
          onboarding: {
            completed: true,
            role,
            company,
            teamSize,
            useCase,
            platforms,
            completedAt: completedAt || new Date().toISOString(),
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Onboarding data saved successfully',
      data: {
        onboardingCompleted: true,
        role,
        company,
        teamSize,
        useCase,
        platforms,
      },
    });
  } catch (error) {
    console.error('Onboarding save error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to save onboarding data',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Get onboarding status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get onboarding data from metadata
    const metadata = typeof user.metadata === 'object' ? user.metadata as any : {};
    const onboardingData = metadata?.onboarding || {};

    return NextResponse.json({
      onboardingCompleted: onboardingData.completed || false,
      data: onboardingData.completed ? {
        role: onboardingData.role,
        company: onboardingData.company,
        teamSize: onboardingData.teamSize,
        useCase: onboardingData.useCase,
        platforms: onboardingData.platforms,
        completedAt: onboardingData.completedAt,
      } : null,
    });
  } catch (error) {
    console.error('Onboarding status error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get onboarding status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
