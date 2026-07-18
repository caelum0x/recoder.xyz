import { NextRequest, NextResponse } from 'next/server';
import { trackUsage } from '@/lib/usage-tracking';
import { requireAuth } from '@/lib/auth-helpers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * POST /api/usage/track
 *
 * Records a usage event against a user's quota. The userId MUST be derived
 * from a verified caller — never from the request body — otherwise any
 * unauthenticated client could exhaust a victim's quota and corrupt billing.
 *
 * Accepted callers:
 *   (a) A web session (Better Auth cookie) — handled by requireAuth.
 *   (b) A CLI request with a Bearer access token — requireAuth falls back to
 *       getUserFromToken (cli_sessions / Better Auth session lookup).
 *   (c) A signed server-to-server call (INTERNAL_SERVICE_KEY). Only in this
 *       trusted path may the userId come from the request body, because the
 *       internal service legitimately acts on behalf of a user.
 */
export async function POST(request: NextRequest) {
  try {
    // Read the raw body once — verifyInternalServiceRequest needs it to check
    // the HMAC signature, and consuming request.json() afterwards would fail.
    const rawBody = await request.text();

    let body: Record<string, unknown>;
    try {
      body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      userId: bodyUserId,
      sessionId,
      requestType,
      modelUsed,
      tokensUsed,
      cost,
      duration,
      platform = 'web', // Default to web, CLI should explicitly set 'cli'
      success = true,
      errorMessage,
    } = body as {
      userId?: unknown;
      sessionId?: string | null;
      requestType?: string;
      modelUsed?: string;
      tokensUsed?: number;
      cost?: number;
      duration?: number;
      platform?: string;
      success?: boolean;
      errorMessage?: string;
    };

    if (!requestType) {
      return NextResponse.json({ error: 'Missing required field: requestType' }, { status: 400 });
    }

    // Resolve the caller's VERIFIED identity. Never trust body.userId on its own.
    let resolvedUserId: string | null = null;

    // (a)/(b): web session cookie or CLI Bearer token.
    const authResult = await requireAuth(request);
    if (!authResult.error) {
      // Prefer the canonical `users` row (matched by email, mirroring the
      // team route) so the quota lookup always targets a real users record;
      // fall back to the session user id.
      const email = authResult.user.email;
      if (email) {
        const appUser = await prisma.users.findUnique({
          where: { email },
          select: { id: true },
        });
        resolvedUserId = appUser?.id ?? authResult.user.id ?? null;
      } else {
        resolvedUserId = authResult.user.id ?? null;
      }

      // A caller-supplied userId that disagrees with the verified identity is
      // never honored — log and ignore it.
      if (bodyUserId && String(bodyUserId) !== resolvedUserId) {
        logger.warn('usage/track: ignoring body userId that does not match verified caller', {
          verifiedUserId: resolvedUserId,
        });
      }
    } else {
      // (c): trusted server-to-server call. Only here may the userId come from
      // the body, and only after the internal signature verifies.
      const internal = verifyInternalServiceRequest(request, { rawBody });
      if (internal.ok) {
        if (!bodyUserId) {
          return NextResponse.json(
            { error: 'Missing required field: userId' },
            { status: 400 },
          );
        }
        resolvedUserId = String(bodyUserId);
      }
    }

    if (!resolvedUserId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    }

    // Detect platform from headers if not explicitly provided
    let detectedPlatform = platform;
    if (!platform || platform === 'web') {
      const userAgent = request.headers.get('user-agent') || '';
      const referer = request.headers.get('referer') || '';

      // Check if request is from CLI
      if (userAgent.includes('recoder-cli') || userAgent.includes('recoder-code')) {
        detectedPlatform = 'cli';
      } else if (referer.includes('web.recoder.xyz') || referer.includes('localhost:5173')) {
        detectedPlatform = 'web';
      }
    }

    const updatedQuota = await trackUsage(
      resolvedUserId,
      (sessionId as string | null | undefined) ?? null,
      requestType as 'cli' | 'api' | 'web' | 'router',
      {
        modelUsed,
        tokensUsed,
        cost,
        duration,
        platform: detectedPlatform,
        success,
        errorMessage,
      },
    );

    return NextResponse.json({
      success: true,
      quota: updatedQuota,
      platform: detectedPlatform, // Return detected platform for confirmation
    });
  } catch (error) {
    logger.error('Track usage error', { error: String(error) });
    return NextResponse.json({ error: 'Failed to track usage' }, { status: 500 });
  }
}
