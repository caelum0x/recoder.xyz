/**
 * Appearance Preferences API
 * PUT - Update user appearance preferences
 */

import { NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

export async function PUT(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { theme, fontSize, density, accentColor, reduceAnimations } = body;

    // TODO: Save to database when UserPreferences model is added
    // await prisma.userPreferences.upsert({
    //   where: { userId: user.id },
    //   create: {
    //     userId: user.id,
    //     theme,
    //     fontSize,
    //     density,
    //     accentColor,
    //     reduceAnimations
    //   },
    //   update: {
    //     theme,
    //     fontSize,
    //     density,
    //     accentColor,
    //     reduceAnimations
    //   }
    // });

    return NextResponse.json({
      success: true,
      message: 'Appearance preferences updated',
      preferences: {
        theme,
        fontSize,
        density,
        accentColor,
        reduceAnimations,
      },
    });
  } catch (error) {
    console.error('Failed to update appearance preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TODO: Fetch from database when UserPreferences model is added
    // const preferences = await prisma.userPreferences.findUnique({
    //   where: { userId: user.id }
    // });

    // Return default preferences for now
    const preferences = {
      theme: 'dark',
      fontSize: 'medium',
      density: 'comfortable',
      accentColor: 'orange',
      reduceAnimations: false,
    };

    return NextResponse.json({
      success: true,
      preferences,
    });
  } catch (error) {
    console.error('Failed to fetch appearance preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}
