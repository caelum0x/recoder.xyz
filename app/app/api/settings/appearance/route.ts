/**
 * Appearance Settings API (for app-level UI preferences)
 * GET - Fetch appearance preferences
 * PUT - Update appearance preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

// GET /api/settings/appearance
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get appearance settings from user_profiles table (using JSONB for flexibility)
    const result = await prisma.$queryRaw`
      SELECT
        COALESCE(
          (SELECT preferences FROM user_profiles WHERE user_id = ${session.user.id}),
          '{}'::jsonb
        ) as preferences
    `;

    const preferences = Array.isArray(result) && result[0] ? result[0].preferences : {};

    // Return default values if not set
    const settings = {
      theme: preferences.theme || 'system',
      fontSize: preferences.fontSize || 'medium',
      density: preferences.density || 'comfortable',
      accentColor: preferences.accentColor || 'orange',
      reduceAnimations: preferences.reduceAnimations || false,
    };

    return NextResponse.json({
      success: true,
      settings
    });

  } catch (error: any) {
    console.error('[Appearance Settings GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch appearance settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/appearance
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { theme, fontSize, density, accentColor, reduceAnimations } = body;

    // Update preferences in user_profiles table
    await prisma.$executeRaw`
      INSERT INTO user_profiles (user_id, preferences)
      VALUES (
        ${session.user.id},
        ${JSON.stringify({ theme, fontSize, density, accentColor, reduceAnimations })}::jsonb
      )
      ON CONFLICT (user_id) DO UPDATE SET
        preferences = ${JSON.stringify({ theme, fontSize, density, accentColor, reduceAnimations })}::jsonb,
        updated_at = NOW()
    `;

    return NextResponse.json({
      success: true,
      message: 'Appearance settings updated successfully'
    });

  } catch (error: any) {
    console.error('[Appearance Settings PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update appearance settings' },
      { status: 500 }
    );
  }
}
