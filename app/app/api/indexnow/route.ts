import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * IndexNow ping endpoint (degrade-truthful).
 *
 * IndexNow (https://www.indexnow.org) lets a site notify participating search
 * engines that specific URLs changed. Bing consumes IndexNow, so a single ping
 * here also feeds Bing crawl without a Bing account — but a Bing *property
 * claim* / analytics still needs the owner's account (out of scope).
 *
 * Truthfulness contract (load-bearing):
 * - When `INDEXNOW_KEY` is unset/empty the route is a NO-OP: it returns
 *   `501 { submitted: false, reason: 'INDEXNOW_KEY not configured' }` and makes
 *   NO network call. It never fabricates a ping or claims a submission.
 * - When the key is present it performs the real HTTP POST to IndexNow and
 *   returns the upstream status verbatim; `submitted` is only `true` for a real
 *   2xx from IndexNow.
 *
 * The IndexNow key is owner-provided via env and the matching validation file
 * (`/<key>.txt`, body == key) is generated from `INDEXNOW_KEY` at deploy time.
 * The committed `public/INDEXNOW_KEY.txt` is only a documented placeholder.
 */

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/**
 * Canonical origin for the marketing/product site. Resolves from env so a
 * deploy can override it, but always falls back to the production origin —
 * never localhost (AGENTS.md rule 4). Kept in lockstep with `app/robots.ts`.
 */
const CANONICAL_ORIGIN = 'https://recoder.xyz';

// IndexNow accepts at most 10,000 URLs per request.
const MAX_URLS_PER_REQUEST = 10_000;

function resolveSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (fromEnv && /^https:\/\//.test(fromEnv)) {
    return fromEnv.replace(/\/+$/, '');
  }
  return CANONICAL_ORIGIN;
}

export interface IndexNowPayload {
  /** Bare hostname of the site being submitted, e.g. `recoder.xyz`. */
  host: string;
  /** The IndexNow key (owner-provided via env). */
  key: string;
  /** Public URL of the key validation file: `${origin}/${key}.txt`. */
  keyLocation: string;
  /** Absolute https URLs to submit; all must belong to `host`. */
  urlList: string[];
}

/**
 * Build the exact IndexNow request payload. Exported so the post-deploy script
 * and tests build the same shape. `keyLocation` follows the IndexNow spec:
 * the key file must be served at that URL with a body equal to the key.
 */
export function buildIndexNowPayload(
  key: string,
  urlList: string[],
  origin: string = resolveSiteOrigin(),
): IndexNowPayload {
  return {
    host: new URL(origin).host,
    key,
    keyLocation: `${origin}/${key}.txt`,
    urlList,
  };
}

/**
 * Keep only absolute https URLs that belong to `host`. IndexNow rejects URLs
 * outside the submitting host, so we validate at the boundary and never trust
 * caller-supplied URLs blindly (fail fast on bad input).
 */
function filterUrlsForHost(candidates: unknown, host: string): string[] {
  if (!Array.isArray(candidates)) return [];
  const valid: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' && parsed.host === host) {
        valid.push(parsed.toString());
      }
    } catch {
      // Not a parseable URL — skip it.
    }
  }
  return valid;
}

/**
 * POST /api/indexnow
 *
 * Body: `{ urlList: string[] }` — absolute https URLs on this site's host.
 * Submits them to IndexNow when `INDEXNOW_KEY` is configured; otherwise a
 * truthful no-op (never a fabricated ping).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const key = (process.env.INDEXNOW_KEY || '').trim();

  // Degrade-truthful no-op: no key ⇒ no network call, no fake submission.
  if (!key) {
    logger.info('IndexNow ping skipped: INDEXNOW_KEY not configured', {
      route: '/api/indexnow',
    });
    return NextResponse.json(
      { submitted: false, reason: 'INDEXNOW_KEY not configured' },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { submitted: false, reason: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const origin = resolveSiteOrigin();
  const host = new URL(origin).host;
  const rawList = (body as { urlList?: unknown } | null)?.urlList;
  const urlList = filterUrlsForHost(rawList, host);

  if (urlList.length === 0) {
    return NextResponse.json(
      {
        submitted: false,
        reason: `No valid https URLs on host ${host} were provided`,
      },
      { status: 400 },
    );
  }

  if (urlList.length > MAX_URLS_PER_REQUEST) {
    return NextResponse.json(
      {
        submitted: false,
        reason: `Too many URLs: ${urlList.length} exceeds the IndexNow limit of ${MAX_URLS_PER_REQUEST}`,
      },
      { status: 400 },
    );
  }

  const payload = buildIndexNowPayload(key, urlList, origin);

  try {
    const upstream = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });

    // Return the upstream IndexNow status verbatim; `submitted` is only true on
    // a real 2xx. We never claim success the upstream did not confirm.
    logger.info('IndexNow ping completed', {
      route: '/api/indexnow',
      upstreamStatus: upstream.status,
      urlCount: urlList.length,
    });
    return NextResponse.json(
      {
        submitted: upstream.ok,
        upstreamStatus: upstream.status,
        urlCount: urlList.length,
      },
      { status: upstream.status },
    );
  } catch (error) {
    logger.error('IndexNow ping failed', {
      route: '/api/indexnow',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { submitted: false, reason: 'IndexNow request failed' },
      { status: 502 },
    );
  }
}
