import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { authorizeSubmitRequest } from '@/lib/seo/submit-auth';
import { submitUrlsToBing } from '@/lib/seo/bing-submission';

/**
 * Bing Webmaster Submission API endpoint — a direct, quota-limited submit to Bing
 * (separate from IndexNow, which already fans out to Bing). Gated behind the
 * SECRET `BING_WEBMASTER_API_KEY`: with no key set the submit is a truthful skip.
 *
 * Auth (write action ⇒ gated): same as `/api/indexnow` — a valid internal-service
 * signature OR the `x-admin-secret` header. Unauthenticated ⇒ 401, no network call.
 *
 * Truthfulness contract: `submitted: true` only on a real 2xx from Bing; upstream
 * failures, missing key, and over-quota are reported verbatim, never fabricated.
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
 * POST /api/bing-submit
 *
 * Body: `{ urls: string[] }` (or legacy `{ urlList: string[] }`) — absolute https
 * URLs on this site's host. Submits them to the Bing Webmaster Submission API.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  const auth = authorizeSubmitRequest(request, rawBody);
  if (!auth.ok) {
    logger.warn('Bing submit rejected: unauthorized', {
      route: '/api/bing-submit',
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
  const result = await submitUrlsToBing(urls);

  if (!result.submitted) {
    logger.info('Bing submit not accepted', {
      route: '/api/bing-submit',
      reason: 'reason' in result ? result.reason : 'unknown',
      upstreamStatus: result.upstreamStatus,
      urlCount: result.urlCount,
    });
    // Missing key / no valid URLs / over-quota ⇒ 400; a real upstream rejection ⇒ its status.
    const status = result.upstreamStatus ?? 400;
    return NextResponse.json(result, { status });
  }

  logger.info('Bing submit completed', {
    route: '/api/bing-submit',
    upstreamStatus: result.upstreamStatus,
    urlCount: result.urlCount,
  });
  return NextResponse.json(result, { status: result.upstreamStatus });
}
