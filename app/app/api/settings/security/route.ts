/**
 * Security Settings API
 * GET - Fetch security preferences
 * PUT - Update security preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';


import { prisma } from '@/lib/prisma';

// GET /api/settings/security
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const settings = await prisma.$queryRaw`
      SELECT
        two_factor_enabled, session_timeout, require_password_change,
        password_change_days, allowed_ip_addresses, block_unknown_devices
      FROM security_settings
      WHERE user_id = ${session.user.id}
    `;

    if (!settings || (Array.isArray(settings) && settings.length === 0)) {
      // Initialize security settings
      await prisma.$executeRaw`
        INSERT INTO security_settings (user_id)
        VALUES (${session.user.id})
        ON CONFLICT (user_id) DO NOTHING
      `;

      return NextResponse.json({
        success: true,
        settings: {
          two_factor_enabled: false,
          session_timeout: 30,
          require_password_change: false,
          password_change_days: 90,
          allowed_ip_addresses: [],
          block_unknown_devices: false,
        }
      });
    }

    return NextResponse.json({
      success: true,
      settings: Array.isArray(settings) ? settings[0] : settings
    });

  } catch (error: any) {
    console.error('[Security Settings GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch security settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/security
export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      two_factor_enabled,
      session_timeout,
      require_password_change,
      password_change_days,
      allowed_ip_addresses,
      block_unknown_devices
    } = body;

    await prisma.$executeRaw`
      INSERT INTO security_settings (
        user_id, two_factor_enabled, session_timeout, require_password_change,
        password_change_days, allowed_ip_addresses, block_unknown_devices
      )
      VALUES (
        ${session.user.id}, ${two_factor_enabled}, ${session_timeout}, ${require_password_change},
        ${password_change_days}, ${JSON.stringify(allowed_ip_addresses)}::jsonb, ${block_unknown_devices}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        two_factor_enabled = EXCLUDED.two_factor_enabled,
        session_timeout = EXCLUDED.session_timeout,
        require_password_change = EXCLUDED.require_password_change,
        password_change_days = EXCLUDED.password_change_days,
        allowed_ip_addresses = EXCLUDED.allowed_ip_addresses,
        block_unknown_devices = EXCLUDED.block_unknown_devices,
        updated_at = NOW()
    `;

    return NextResponse.json({
      success: true,
      message: 'Security settings updated successfully'
    });

  } catch (error: any) {
    console.error('[Security Settings PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update security settings' },
      { status: 500 }
    );
  }
}
