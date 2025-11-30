/**
 * Notification Settings API
 * GET - Fetch notification preferences
 * PUT - Update notification preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

// GET /api/settings/notifications
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
        email_notifications, desktop_notifications, sound_enabled,
        notification_frequency, email_digest, project_updates,
        security_alerts, billing_updates
      FROM notification_settings
      WHERE user_id = ${session.user.id}
    `;

    if (!settings || (Array.isArray(settings) && settings.length === 0)) {
      // Initialize notification settings
      await prisma.$executeRaw`
        INSERT INTO notification_settings (user_id)
        VALUES (${session.user.id})
        ON CONFLICT (user_id) DO NOTHING
      `;

      return NextResponse.json({
        success: true,
        settings: {
          email_notifications: true,
          desktop_notifications: true,
          sound_enabled: true,
          notification_frequency: 'instant',
          email_digest: true,
          project_updates: true,
          security_alerts: true,
          billing_updates: true,
        }
      });
    }

    return NextResponse.json({
      success: true,
      settings: Array.isArray(settings) ? settings[0] : settings
    });

  } catch (error: any) {
    console.error('[Notification Settings GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch notification settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/notifications
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
      email_notifications,
      desktop_notifications,
      sound_enabled,
      notification_frequency,
      email_digest,
      project_updates,
      security_alerts,
      billing_updates
    } = body;

    await prisma.$executeRaw`
      INSERT INTO notification_settings (
        user_id, email_notifications, desktop_notifications, sound_enabled,
        notification_frequency, email_digest, project_updates,
        security_alerts, billing_updates
      )
      VALUES (
        ${session.user.id}, ${email_notifications}, ${desktop_notifications}, ${sound_enabled},
        ${notification_frequency}, ${email_digest}, ${project_updates},
        ${security_alerts}, ${billing_updates}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        email_notifications = EXCLUDED.email_notifications,
        desktop_notifications = EXCLUDED.desktop_notifications,
        sound_enabled = EXCLUDED.sound_enabled,
        notification_frequency = EXCLUDED.notification_frequency,
        email_digest = EXCLUDED.email_digest,
        project_updates = EXCLUDED.project_updates,
        security_alerts = EXCLUDED.security_alerts,
        billing_updates = EXCLUDED.billing_updates,
        updated_at = NOW()
    `;

    return NextResponse.json({
      success: true,
      message: 'Notification settings updated successfully'
    });

  } catch (error: any) {
    console.error('[Notification Settings PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update notification settings' },
      { status: 500 }
    );
  }
}
