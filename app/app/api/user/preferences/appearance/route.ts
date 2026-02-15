/**
 * Appearance Preferences API
 * GET - Fetch user appearance preferences
 * PUT - Update user appearance preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';

const DEFAULTS = {
  theme: 'dark',
  fontSize: 'medium',
  density: 'comfortable',
  accentColor: 'orange',
  reduceAnimations: false,
};

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const user = authResult.user;

    if (!user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const dbUser = await prisma.users.findUnique({
      where: { email: user.email },
      select: { id: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { theme, fontSize, density, accentColor, reduceAnimations } = body;

    // Validate allowed values
    const allowedThemes = ['dark', 'light', 'system'];
    const allowedFontSizes = ['small', 'medium', 'large'];
    const allowedDensities = ['compact', 'comfortable', 'spacious'];

    if (theme && !allowedThemes.includes(theme)) {
      return NextResponse.json(
        { success: false, error: `Invalid theme. Must be one of: ${allowedThemes.join(', ')}` },
        { status: 400 }
      );
    }
    if (fontSize && !allowedFontSizes.includes(fontSize)) {
      return NextResponse.json(
        { success: false, error: `Invalid fontSize. Must be one of: ${allowedFontSizes.join(', ')}` },
        { status: 400 }
      );
    }
    if (density && !allowedDensities.includes(density)) {
      return NextResponse.json(
        { success: false, error: `Invalid density. Must be one of: ${allowedDensities.join(', ')}` },
        { status: 400 }
      );
    }

    // Build the theme preferences object with only provided fields
    const themePreferences: Record<string, any> = {};
    if (theme !== undefined) themePreferences.theme = theme;
    if (fontSize !== undefined) themePreferences.fontSize = fontSize;
    if (density !== undefined) themePreferences.density = density;
    if (accentColor !== undefined) themePreferences.accentColor = accentColor;
    if (reduceAnimations !== undefined) themePreferences.reduceAnimations = reduceAnimations;

    // Fetch existing preferences to merge
    const existing = await prisma.user_preferences.findUnique({
      where: { userId: dbUser.id },
    });

    const currentThemePrefs = (existing?.themePreferences as Record<string, any>) || {};
    const merged = { ...DEFAULTS, ...currentThemePrefs, ...themePreferences };

    await prisma.user_preferences.upsert({
      where: { userId: dbUser.id },
      create: {
        id: crypto.randomUUID(),
        userId: dbUser.id,
        themePreferences: merged,
        updatedAt: new Date(),
      },
      update: {
        themePreferences: merged,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Appearance preferences updated',
      preferences: merged,
    });
  } catch (error) {
    console.error('Failed to update appearance preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const user = authResult.user;

    if (!user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const dbUser = await prisma.users.findUnique({
      where: { email: user.email },
      select: { id: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const prefs = await prisma.user_preferences.findUnique({
      where: { userId: dbUser.id },
    });

    const themePrefs = (prefs?.themePreferences as Record<string, any>) || {};
    const preferences = { ...DEFAULTS, ...themePrefs };

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
