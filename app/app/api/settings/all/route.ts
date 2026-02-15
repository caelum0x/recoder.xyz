/**
 * All Settings API
 * GET - Fetch all settings in one request
 * Useful for settings dashboard and recoder-web initialization
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

// GET /api/settings/all - Get all settings
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Initialize all settings if they don't exist
    await prisma.$executeRaw`SELECT initialize_user_settings(${session.user.id})`;

    // Fetch all settings in parallel
    const [profile, editor, ai, security, notifications, project, shortcuts, integrations] = await Promise.all([
      prisma.$queryRaw`SELECT * FROM user_profiles WHERE user_id = ${session.user.id}`,
      prisma.$queryRaw`SELECT * FROM editor_settings WHERE user_id = ${session.user.id}`,
      prisma.$queryRaw`SELECT * FROM ai_settings WHERE user_id = ${session.user.id}`,
      prisma.$queryRaw`SELECT * FROM security_settings WHERE user_id = ${session.user.id}`,
      prisma.$queryRaw`SELECT * FROM notification_settings WHERE user_id = ${session.user.id}`,
      prisma.$queryRaw`SELECT * FROM project_settings WHERE user_id = ${session.user.id}`,
      prisma.$queryRaw`SELECT * FROM keyboard_shortcuts WHERE user_id = ${session.user.id}`,
      prisma.$queryRaw`SELECT * FROM integration_settings WHERE user_id = ${session.user.id}`
    ]);

    return NextResponse.json({
      success: true,
      settings: {
        profile: Array.isArray(profile) ? profile[0] : profile,
        editor: Array.isArray(editor) ? editor[0] : editor,
        ai: Array.isArray(ai) ? ai[0] : ai,
        security: Array.isArray(security) ? security[0] : security,
        notifications: Array.isArray(notifications) ? notifications[0] : notifications,
        project: Array.isArray(project) ? project[0] : project,
        shortcuts: Array.isArray(shortcuts) ? shortcuts[0] : shortcuts,
        integrations: Array.isArray(integrations) ? integrations[0] : integrations
      }
    });

  } catch (error: any) {
    console.error('[All Settings GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
