import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { authorizeSubmitRequest } from '@/lib/seo/submit-auth';
import { resolveIndexNowKey, submitUrls } from '@/lib/seo/indexnow';

/**
 * IndexNow ping endpoint.
 *
 * IndexNow (https://www.indexnow.org) notifies participating search engines
 * (Bing, Yandex, Seznam, …) that specific URLs changed; one submission fans out
 * to all engines. This route lets a server-side content-change flow (or an owner)
 * trigger a submission.
 *
 * Auth (write action ⇒ gated): the caller must present EITHER a valid internal
 * service signature (`x-internal-*`, for server-to-server content flows) OR the
 * admin secret header (`x-admin-secret`, for an owner-triggered submit). An
 * unauthenticated request is rejected with 401 and makes no network call.
 *
 * Truthfulness contract: `submitted: true` is returned ONLY on a real 2xx from
 * IndexNow. Upstream failures are reported verbatim; nothing is fabricated. The
 * key + payload live in `@/lib/seo/indexnow` so the route, the key file, and the
 * post-deploy script cannot drift.
 */

export const dynamic = 'force-dynamic';

/** Input schema — accepts `urls` (preferred) or legacy `urlList`. */
const submitBodySchema = z
  .object({
    urls: z.array(z.string()).max(10_000).optional(),
    urlList: z.array(z.string()).max(10_000).optional(),
  })
  .refine((body) => Boolean(body.urls?.length || body.urlList?.length), {
    message: 'Provide a non-empty `urls` (or `urlList`) array',
  });

/**
 * POST /api/indexnow
 *
 * Body: `{ urls: string[] }` (or legacy `{ urlList: string[] }`) — absolute
 * https URLs on this site's host. Submits them to IndexNow.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  const auth = authorizeSubmitRequest(request, rawBody);
  if (!auth.ok) {
    logger.warn('IndexNow ping rejected: unauthorized', {
      route: '/api/indexnow',
      reason: 'reason' in auth ? auth.reason : 'unauthorized',
    });
    return NextResponse.json({ submitted: false, reason: 'Unauthorized' }, { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ submitted: false, reason: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = submitBodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      { submitted: false, reason: parsed.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 },
    );
  }

  const urls = parsed.data.urls ?? parsed.data.urlList ?? [];
  const result = await submitUrls(urls);

  if (!result.submitted) {
    logger.info('IndexNow ping not accepted', {
      route: '/api/indexnow',
      reason: 'reason' in result ? result.reason : 'unknown',
      upstreamStatus: result.upstreamStatus,
      urlCount: result.urlCount,
    });
    // No valid URLs / over-cap ⇒ 400; a real upstream rejection ⇒ its status.
    const status = result.upstreamStatus ?? 400;
    return NextResponse.json(result, { status });
  }

  logger.info('IndexNow ping completed', {
    route: '/api/indexnow',
    upstreamStatus: result.upstreamStatus,
    urlCount: result.urlCount,
    keyMasked: resolveIndexNowKey().slice(0, 4) + '…',
  });
  return NextResponse.json(result, { status: result.upstreamStatus });
}
