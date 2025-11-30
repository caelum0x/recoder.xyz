/**
 * Editor Settings API (for recoder-web)
 * GET - Fetch editor settings
 * PUT - Update editor settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// GET /api/settings/editor - Get editor settings
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const preferences = await prisma.user_preferences.findUnique({
      where: { userId: session.user.id },
      select: {
        developerPreferences: true
      }
    });

    const defaultSettings = {
      theme: 'dark',
      color_scheme: 'nord',
      font_family: 'JetBrains Mono',
      font_size: 14,
      line_height: 1.5,
      tab_size: 2,
      use_spaces: true,
      word_wrap: true,
      line_numbers: true,
      minimap: true,
      bracket_matching: true,
      auto_closing_brackets: true,
      format_on_save: true,
      format_on_paste: false,
      trim_trailing_whitespace: true,
      terminal_font_size: 14,
      terminal_cursor_style: 'block',
      terminal_shell: 'bash'
    };

    const settings = preferences?.developerPreferences || defaultSettings;

    return NextResponse.json({
      success: true,
      settings
    });

  } catch (error: any) {
    console.error('[Editor Settings GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch editor settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/editor - Update editor settings
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

    // Update editor preferences using user_preferences
    await prisma.user_preferences.upsert({
      where: { userId: session.user.id },
      update: {
        developerPreferences: body,
        updatedAt: new Date()
      },
      create: {
        id: crypto.randomUUID(),
        userId: session.user.id,
        developerPreferences: body,
        updatedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Editor settings updated successfully'
    });

  } catch (error: any) {
    console.error('[Editor Settings PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update editor settings' },
      { status: 500 }
    );
  }
}
