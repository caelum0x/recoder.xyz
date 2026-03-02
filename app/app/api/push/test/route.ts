import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isStaleSubscription, sendWebPush } from '@/lib/push-server';
import { ensureAdminAccess } from '@/lib/admin-auth';
import { rateLimit } from '@/lib/middleware/rate-limit';
import {
  clampMaxTargets,
  normalizePushMessage,
  validatePushMessage,
} from '@/lib/push-admin-validation';

interface TestPushBody {
  userId?: string;
  endpoint?: string;
  title?: string;
  body?: string;
  url?: string;
  dryRun?: boolean;
  transport?: 'direct' | 'relay';
  maxTargets?: number;
}

const adminPushTestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 20,
});

function normalizeBody(input: TestPushBody) {
  const transport = input.transport === 'relay' ? 'relay' : 'direct';
  const dryRun = input.dryRun ?? true;
  const messageData = normalizePushMessage({
    title: input.title || 'Recoder test notification',
    body: input.body || 'Push delivery test from admin endpoint',
    url: input.url || '/dashboard',
  });
  const userId = input.userId?.trim();
  const endpoint = input.endpoint?.trim();
  const maxTargets = clampMaxTargets(input.maxTargets, 25, 100);

  return { transport, dryRun, ...messageData, userId, endpoint, maxTargets };
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await adminPushTestRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const adminResult = await ensureAdminAccess(request);
    if ('response' in adminResult) {
      return adminResult.response;
    }
    const admin = adminResult.admin;

    const input = (await request.json()) as TestPushBody;
    const { transport, dryRun, title, body, url, userId, endpoint, maxTargets } = normalizeBody(input);

    const validationError = validatePushMessage({ title, body, url });
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    const subscriptions = await prisma.web_push_subscriptions.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(endpoint ? { endpoint } : {}),
      },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        createdAt: true,
      },
      take: maxTargets,
      orderBy: { createdAt: 'desc' },
    });

    if (!subscriptions.length) {
      return NextResponse.json(
        { success: false, error: 'No push subscriptions found for provided filters' },
        { status: 404 }
      );
    }

    const payload = {
      title,
      body,
      url,
      timestamp: new Date().toISOString(),
      type: 'admin_test_push',
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        mode: 'dry-run',
        transport,
        maxTargets,
        subscriptions: subscriptions.map((s) => ({
          id: s.id,
          userId: s.userId,
          endpointSuffix: s.endpoint.slice(-24),
        })),
        payload,
        message:
          "Dry run complete. Set dryRun=false to dispatch. Use transport='direct' for VAPID send or transport='relay' for webhook relay.",
      });
    }

    if (transport === 'direct') {
      const results = await Promise.all(
        subscriptions.map((s) =>
          sendWebPush(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            payload
          )
        )
      );

      const delivered = results.filter((r) => r.ok).length;
      const failed = results.length - delivered;
      const staleEndpoints = results.filter((r) => isStaleSubscription(r)).map((r) => r.endpoint);

      if (staleEndpoints.length > 0) {
        await prisma.web_push_subscriptions.deleteMany({
          where: {
            endpoint: { in: staleEndpoints },
          },
        });
      }

      return NextResponse.json({
        success: true,
        mode: 'direct',
        transport,
        maxTargets,
        payload,
        delivered,
        failed,
        prunedStaleSubscriptions: staleEndpoints.length,
        results: results.map((r) => ({
          ok: r.ok,
          endpointSuffix: r.endpoint.slice(-24),
          statusCode: r.statusCode ?? null,
          error: r.error ?? null,
        })),
      });
    }

    const webhookUrl = process.env.PUSH_TEST_WEBHOOK_URL;
    const webhookSecret = process.env.PUSH_TEST_WEBHOOK_SECRET;

    if (!webhookUrl) {
      return NextResponse.json(
        {
          success: false,
          error: 'PUSH_TEST_WEBHOOK_URL is not configured',
          message: 'Dispatch is disabled without a server-side push relay endpoint',
        },
        { status: 501 }
      );
    }

    const relayResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { 'x-push-test-secret': webhookSecret } : {}),
      },
      body: JSON.stringify({
        initiatedBy: { userId: admin.userId, email: admin.email },
        authenticatedVia: admin.via,
        subscriptions,
        payload,
      }),
      cache: 'no-store',
    });

    const relayBody = await relayResponse.text();
    if (!relayResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Push relay failed with status ${relayResponse.status}`,
          relayBody: relayBody.slice(0, 1000),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'relay',
      transport,
      maxTargets,
      deliveredTo: subscriptions.length,
      relayBody: relayBody.slice(0, 1000),
      payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute test push',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await adminPushTestRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const adminResult = await ensureAdminAccess(request);
    if ('response' in adminResult) {
      return adminResult.response;
    }
    const admin = adminResult.admin;

    const subscriptionCount = await prisma.web_push_subscriptions.count();

    return NextResponse.json({
      success: true,
      authenticatedVia: admin.via,
      config: {
        webPushEnabled: process.env.WEB_PUSH_ENABLED !== 'false',
        vapidPublicKeyConfigured: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
        vapidPrivateKeyConfigured: Boolean(process.env.VAPID_PRIVATE_KEY),
        relayConfigured: Boolean(process.env.PUSH_TEST_WEBHOOK_URL),
        relaySecretConfigured: Boolean(process.env.PUSH_TEST_WEBHOOK_SECRET),
      },
      subscriptionCount,
      usage: {
        method: 'POST',
        endpoint: '/api/push/test',
        body: {
          userId: 'optional',
          endpoint: 'optional',
          title: 'optional',
          body: 'optional',
          url: 'optional',
          maxTargets: 25,
          dryRun: true,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load push test status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
