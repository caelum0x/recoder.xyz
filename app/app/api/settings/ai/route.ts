/**
 * AI Settings API
 * GET - Fetch AI preferences
 * PUT - Update AI preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

// GET /api/settings/ai
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const settings = await prisma.$queryRaw`
      SELECT
        default_model, temperature, max_tokens, top_p,
        streaming_enabled, code_validation, auto_fix_errors,
        include_file_tree, max_context_files
      FROM ai_settings
      WHERE user_id = ${session.user.id}
    `;

    if (!settings || (Array.isArray(settings) && settings.length === 0)) {
      await prisma.$executeRaw`
        INSERT INTO ai_settings (user_id)
        VALUES (${session.user.id})
        ON CONFLICT (user_id) DO NOTHING
      `;

      return NextResponse.json({
        success: true,
        settings: {
          default_model: 'claude-3.5-sonnet',
          temperature: 0.7,
          max_tokens: 4096,
          top_p: 0.9,
          streaming_enabled: true,
          code_validation: true,
          auto_fix_errors: false,
          include_file_tree: true,
          max_context_files: 10
        }
      });
    }

    return NextResponse.json({
      success: true,
      settings: Array.isArray(settings) ? settings[0] : settings
    });

  } catch (error: any) {
    console.error('[AI Settings GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch AI settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/ai
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
    const {
      default_model,
      temperature,
      max_tokens,
      top_p,
      streaming_enabled,
      code_validation,
      auto_fix_errors,
      include_file_tree,
      max_context_files
    } = body;

    await prisma.$executeRaw`
      INSERT INTO ai_settings (
        user_id, default_model, temperature, max_tokens, top_p,
        streaming_enabled, code_validation, auto_fix_errors,
        include_file_tree, max_context_files
      )
      VALUES (
        ${session.user.id}, ${default_model}, ${temperature}, ${max_tokens}, ${top_p},
        ${streaming_enabled}, ${code_validation}, ${auto_fix_errors},
        ${include_file_tree}, ${max_context_files}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        default_model = EXCLUDED.default_model,
        temperature = EXCLUDED.temperature,
        max_tokens = EXCLUDED.max_tokens,
        top_p = EXCLUDED.top_p,
        streaming_enabled = EXCLUDED.streaming_enabled,
        code_validation = EXCLUDED.code_validation,
        auto_fix_errors = EXCLUDED.auto_fix_errors,
        include_file_tree = EXCLUDED.include_file_tree,
        max_context_files = EXCLUDED.max_context_files,
        updated_at = NOW()
    `;

    return NextResponse.json({
      success: true,
      message: 'AI settings updated successfully'
    });

  } catch (error: any) {
    console.error('[AI Settings PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update AI settings' },
      { status: 500 }
    );
  }
}
