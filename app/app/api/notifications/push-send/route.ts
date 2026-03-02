/**
 * Push Notification Send Endpoint (admin-only)
 *
 * POST — Send a push notification to a specific user or to all subscribers.
 *
 * Authentication: either
 *   - x-admin-secret header matching ADMIN_SECRET env var, OR
 *   - Authenticated session with role === 'admin'
 *
 * Body:
 *   {
 *     userId?: string       — target a single user (omit to broadcast)
 *     title:   string       — notification title
 *     body:    string       — notification body text
 *     url?:    string       — deep-link URL (defaults to "/")
 *     tag?:    string       — notification tag for dedup
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWebPush, isStaleSubscription } from '@/lib/push-server';
import { ensureAdminAccess } from '@/lib/admin-auth';
import { rateLimit } from '@/lib/middleware/rate-limit';
import {
  clampMaxTargets,
  normalizePushMessage,
  validatePushMessage,
} from '@/lib/push-admin-validation';

// ---------------------------------------------------------------------------
// POST — send push notification(s)
// ---------------------------------------------------------------------------

interface SendBody {
  userId?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  maxTargets?: number;
}

const adminPushSendRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 20,
});

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await adminPushSendRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const adminResult = await ensureAdminAccess(request);
    if ('response' in adminResult) {
      return adminResult.response;
    }

    const bodyInput = (await request.json()) as SendBody;
    const normalizedMessage = normalizePushMessage(bodyInput);
    const userId = bodyInput.userId?.trim();
    const maxTargets = clampMaxTargets(bodyInput.maxTargets, 200, 500);

    const validationError = validatePushMessage(normalizedMessage);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    // Look up target subscriptions
    const subscriptions = await prisma.web_push_subscriptions.findMany({
      where: userId ? { userId } : {},
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
      take: maxTargets,
      orderBy: { createdAt: 'desc' },
    });

    if (subscriptions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: userId
            ? 'No push subscriptions found for this user'
            : 'No push subscriptions found',
        },
        { status: 404 }
      );
    }

    const payload = {
      title: normalizedMessage.title,
      body: normalizedMessage.body,
      url: normalizedMessage.url,
      timestamp: new Date().toISOString(),
      type: 'admin_push',
      ...(normalizedMessage.tag ? { tag: normalizedMessage.tag } : {}),
    };

    // Send to all matching subscriptions concurrently
    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload
        )
      )
    );

    // Collect metrics
    let delivered = 0;
    let failed = 0;
    const staleEndpoints: string[] = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        if (result.value.ok) {
          delivered++;
        } else {
          failed++;
          if (isStaleSubscription(result.value)) {
            staleEndpoints.push(subscriptions[i].endpoint);
          }
        }
      } else {
        failed++;
      }
    });

    // Prune stale/expired subscriptions (410 Gone, 404 Not Found)
    if (staleEndpoints.length > 0) {
      await prisma.web_push_subscriptions.deleteMany({
        where: { endpoint: { in: staleEndpoints } },
      });
    }

    return NextResponse.json({
      success: true,
      delivered,
      failed,
      total: subscriptions.length,
      maxTargets,
      prunedStaleSubscriptions: staleEndpoints.length,
    });
  } catch (error) {
    console.error('[push-send] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send push notifications',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
