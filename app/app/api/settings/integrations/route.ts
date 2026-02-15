/**
 * Integration Settings API
 * GET - Fetch integration settings
 * PUT - Update integration settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

// GET /api/settings/integrations
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
        webhooks, github_integration, slack_integration,
        discord_integration, custom_integrations
      FROM integration_settings
      WHERE user_id = ${session.user.id}
    `;

    if (!settings || (Array.isArray(settings) && settings.length === 0)) {
      // Initialize integration settings
      await prisma.$executeRaw`
        INSERT INTO integration_settings (user_id)
        VALUES (${session.user.id})
        ON CONFLICT (user_id) DO NOTHING
      `;

      return NextResponse.json({
        success: true,
        settings: {
          webhooks: [],
          github_integration: false,
          slack_integration: false,
          discord_integration: false,
          custom_integrations: {},
        }
      });
    }

    return NextResponse.json({
      success: true,
      settings: Array.isArray(settings) ? settings[0] : settings
    });

  } catch (error: any) {
    console.error('[Integration Settings GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch integration settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/integrations
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
      webhooks,
      github_integration,
      slack_integration,
      discord_integration,
      custom_integrations
    } = body;

    await prisma.$executeRaw`
      INSERT INTO integration_settings (
        user_id, webhooks, github_integration, slack_integration,
        discord_integration, custom_integrations
      )
      VALUES (
        ${session.user.id}, ${JSON.stringify(webhooks || [])}::jsonb, ${github_integration},
        ${slack_integration}, ${discord_integration}, ${JSON.stringify(custom_integrations || {})}::jsonb
      )
      ON CONFLICT (user_id) DO UPDATE SET
        webhooks = EXCLUDED.webhooks,
        github_integration = EXCLUDED.github_integration,
        slack_integration = EXCLUDED.slack_integration,
        discord_integration = EXCLUDED.discord_integration,
        custom_integrations = EXCLUDED.custom_integrations,
        updated_at = NOW()
    `;

    return NextResponse.json({
      success: true,
      message: 'Integration settings updated successfully'
    });

  } catch (error: any) {
    console.error('[Integration Settings PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update integration settings' },
      { status: 500 }
    );
  }
}
