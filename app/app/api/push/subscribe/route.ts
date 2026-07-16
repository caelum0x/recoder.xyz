import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

interface PushSubscriptionPayload {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.response;

    const body = (await request.json()) as PushSubscriptionPayload;
    const endpoint = body.endpoint?.trim();
    const p256dh = body.keys?.p256dh?.trim();
    const authKey = body.keys?.auth?.trim();

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json(
        { success: false, error: 'Invalid push subscription payload' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const userAgent = request.headers.get('user-agent');

    await prisma.$executeRaw`
      INSERT INTO web_push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
      VALUES (${id}, ${auth.user.id}, ${endpoint}, ${p256dh}, ${authKey}, ${userAgent}, NOW(), NOW())
      ON CONFLICT (endpoint)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true, message: 'Push subscription saved' });
  } catch (error) {
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

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.response;

    const body = (await request.json()) as { endpoint?: string };
    const endpoint = body.endpoint?.trim();

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: 'Endpoint is required' },
        { status: 400 }
      );
    }

    await prisma.$executeRaw`
      DELETE FROM web_push_subscriptions
      WHERE endpoint = ${endpoint}
        AND user_id = ${auth.user.id}
    `;

    return NextResponse.json({ success: true, message: 'Push subscription removed' });
  } catch (error) {
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
