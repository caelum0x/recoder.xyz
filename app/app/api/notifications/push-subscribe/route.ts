/**
 * Push Subscription Management
 *
 * POST  — Save or update a push subscription for the authenticated user
 * DELETE — Remove a push subscription for the authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PushSubscriptionBody {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

// ---------------------------------------------------------------------------
// POST — Save / upsert a push subscription
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.response;

    const body = (await request.json()) as PushSubscriptionBody;
    const endpoint = body.endpoint?.trim();
    const p256dh = body.keys?.p256dh?.trim();
    const authKey = body.keys?.auth?.trim();

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json(
        { success: false, error: 'Invalid push subscription: endpoint, keys.p256dh, and keys.auth are required' },
        { status: 400 }
      );
    }

    // Look up the users-table ID for this session user
    const dbUser = await prisma.users.findFirst({
      where: {
        OR: [
          { id: auth.user!.id },
          { email: auth.user!.email },
        ],
      },
      select: { id: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const id = crypto.randomUUID();
    const userAgent = request.headers.get('user-agent') || null;

    // Upsert: if the endpoint already exists, update the keys / owner
    await prisma.$executeRaw`
      INSERT INTO web_push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
      VALUES (${id}, ${dbUser.id}, ${endpoint}, ${p256dh}, ${authKey}, ${userAgent}, NOW(), NOW())
      ON CONFLICT (endpoint)
      DO UPDATE SET
        user_id    = EXCLUDED.user_id,
        p256dh     = EXCLUDED.p256dh,
        auth       = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true, message: 'Push subscription saved' });
  } catch (error) {
    console.error('[push-subscribe] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save push subscription',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — Remove a push subscription
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.response;

    const body = (await request.json()) as { endpoint?: string };
    const endpoint = body.endpoint?.trim();

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: 'endpoint is required' },
        { status: 400 }
      );
    }

    const dbUser = await prisma.users.findFirst({
      where: {
        OR: [
          { id: auth.user!.id },
          { email: auth.user!.email },
        ],
      },
      select: { id: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    await prisma.$executeRaw`
      DELETE FROM web_push_subscriptions
      WHERE endpoint = ${endpoint}
        AND user_id  = ${dbUser.id}
    `;

    return NextResponse.json({ success: true, message: 'Push subscription removed' });
  } catch (error) {
    console.error('[push-subscribe] DELETE error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to remove push subscription',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
