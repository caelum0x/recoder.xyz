/**
 * Security Settings API
 * GET - Fetch security preferences
 * PUT - Update security preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import {
  assertSecuritySettingsGetResponse,
  assertSecuritySettingsPutResponse,
} from '@/lib/contracts/security-contracts';
import { prisma } from '@/lib/prisma';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toBoolean(value: unknown): boolean {
  return Boolean(value);
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// GET /api/settings/security
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

      return NextResponse.json(assertSecuritySettingsGetResponse({
        success: true,
        settings: {
          two_factor_enabled: false,
          session_timeout: 30,
          require_password_change: false,
          password_change_days: 90,
          allowed_ip_addresses: [],
          block_unknown_devices: false,
        }
      }));
    }

    const rawSettings = Array.isArray(settings) ? settings[0] : settings;
    const record = asRecord(rawSettings);
    const allowedIpAddresses = record.allowed_ip_addresses;
    const normalizedSettings = {
      ...record,
      two_factor_enabled: toBoolean(record.two_factor_enabled),
      session_timeout: toNumber(record.session_timeout, 30),
      require_password_change: toBoolean(record.require_password_change),
      password_change_days: toNumber(record.password_change_days, 90),
      allowed_ip_addresses: Array.isArray(allowedIpAddresses)
        ? allowedIpAddresses.filter((value): value is string => typeof value === 'string')
        : [],
      block_unknown_devices: toBoolean(record.block_unknown_devices),
    };

    return NextResponse.json(assertSecuritySettingsGetResponse({
      success: true,
      settings: normalizedSettings,
    }));

  } catch (error: any) {
    console.error('[Security Settings GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch security settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/security
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

    return NextResponse.json(assertSecuritySettingsPutResponse({
      success: true,
      message: 'Security settings updated successfully'
    }));

  } catch (error: any) {
    console.error('[Security Settings PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update security settings' },
      { status: 500 }
    );
  }
}
