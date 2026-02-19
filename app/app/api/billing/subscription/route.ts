import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const PRODUCTION_ENGINE_URL = process.env.PRODUCTION_ENGINE_URL || 'http://localhost:4567';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.response;
  const userId = authResult.session.user.id;

  try {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    const response = await fetch(`${PRODUCTION_ENGINE_URL}/api/billing/subscription/${userId}`, {
      headers: {
        'x-user-id': userId,
        'x-admin-key': adminKey,
      }
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('Subscription fetch error', { route: 'api/billing/subscription', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch subscription data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.response;
  const userId = authResult.session.user.id;

  try {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    const body = await request.json();

    const response = await fetch(`${PRODUCTION_ENGINE_URL}/api/billing/upgrade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({ userId, ...body })
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('Subscription update error', { route: 'api/billing/subscription', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}