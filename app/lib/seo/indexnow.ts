/**
 * IndexNow shared core — single source of truth for the key, origin resolution,
 * payload shape, and the submit call. Both the API route
 * (`app/app/api/indexnow/route.ts`) and any server-side content-change flow
 * import from here so the key-file, the route, and the submitter can never drift
 * apart.
 *
 * IndexNow (https://www.indexnow.org) lets a site notify participating search
 * engines (Bing, Yandex, Seznam, …) that specific URLs changed. Submitting to
 * one participating endpoint fans out to all of them.
 *
 * Truthfulness contract (load-bearing): `submitUrls` performs a REAL HTTP POST
 * and reports the upstream status verbatim. It NEVER fabricates a submission and
 * NEVER throws into a request path — network/HTTP failures come back as a typed
 * result with `submitted: false`.
 */

/** Participating IndexNow endpoint; a single POST here fans out to all engines. */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** IndexNow accepts at most 10,000 URLs per request. */
export const MAX_URLS_PER_REQUEST = 10_000;

/**
 * Canonical production origin. Never localhost (AGENTS.md rule 4). Kept in
 * lockstep with `app/robots.ts` / `app/sitemap.ts`.
 */
const CANONICAL_ORIGIN = 'https://recoder.xyz';

/**
 * Committed public IndexNow key.
 *
 * NOT A SECRET: the IndexNow protocol requires this exact value to be served
 * publicly at `https://recoder.xyz/<key>.txt`, so it is public by design. It is
 * committed (and its matching `app/public/<key>.txt` file is committed too) so a
 * fresh deploy has a working, spec-compliant IndexNow setup with no manual step.
 *
 * ROTATION: set `INDEXNOW_KEY` in the deploy env to a new 8–128 char
 * `[a-zA-Z0-9-]` value AND serve a matching `<new-key>.txt` at the site root
 * (replace `app/public/<key>.txt`). `resolveIndexNowKey()` prefers the env value
 * when it is a valid key. See docs/growth/SEARCH-SUBMISSION-RUNBOOK.md §4.
 */
export const DEFAULT_INDEXNOW_KEY = 'fc855a24fb8ed402c70b39f17fe8b444';

/** IndexNow key charset/length rule: 8–128 chars of `[a-zA-Z0-9-]`. */
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

/** Validate a candidate key against the IndexNow spec (charset + length). */
export function isValidIndexNowKey(candidate: string): boolean {
  return KEY_PATTERN.test(candidate);
}

/**
 * Resolve the active IndexNow key: a valid `INDEXNOW_KEY` env value wins (for
 * rotation), otherwise the committed public default. Always returns a spec-valid
 * key, so IndexNow is live by default rather than a no-op.
 */
export function resolveIndexNowKey(): string {
  const fromEnv = (process.env.INDEXNOW_KEY || '').trim();
  if (fromEnv && isValidIndexNowKey(fromEnv)) {
    return fromEnv;
  }
  return DEFAULT_INDEXNOW_KEY;
}

/**
 * Resolve the site origin from env (deploy override) or the canonical origin.
 * Only `https://…` overrides are accepted — never localhost in production paths.
 */
export function resolveSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (fromEnv && /^https:\/\//.test(fromEnv)) {
    return fromEnv.replace(/\/+$/, '');
  }
  return CANONICAL_ORIGIN;
}

/** Bare host (e.g. `recoder.xyz`) for the resolved origin. */
export function resolveSiteHost(): string {
  return new URL(resolveSiteOrigin()).host;
}

/**
 * Build an absolute site URL for a path (e.g. `/blog/foo`) on the resolved
 * origin. A leading slash is optional; the result is always `${origin}/${path}`.
 * Used by content-change hooks to turn a changed doc's route into a submittable
 * absolute https URL (which `submitUrls` then re-validates against the host).
 */
export function siteUrlForPath(path: string): string {
  const origin = resolveSiteOrigin();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${normalized}`;
}

/**
 * Whether a runtime IndexNow submission (e.g. a CMS content-change hook) should
 * actually POST. The key and host always resolve, so this env gate — not the
 * key — is the meaningful on/off switch for runtime pings:
 *
 * - In production (`NODE_ENV === 'production'`) submissions are enabled, so a
 *   real content publish in the live CMS notifies search engines immediately.
 * - Elsewhere (dev, test, CI) they are skipped so local edits never ping live
 *   search engines. Set `INDEXNOW_ENABLE_IN_DEV=1` to force it on for testing.
 *
 * This never throws and makes no network call — it only decides whether the
 * caller should submit.
 */
export function isIndexNowSubmissionEnabled(): boolean {
  if ((process.env.INDEXNOW_ENABLE_IN_DEV || '').trim() === '1') {
    return true;
  }
  return process.env.NODE_ENV === 'production';
}

export interface IndexNowPayload {
  /** Bare hostname of the site being submitted, e.g. `recoder.xyz`. */
  host: string;
  /** The IndexNow key (public; must match the served `<key>.txt`). */
  key: string;
  /** Public URL of the key validation file: `${origin}/${key}.txt`. */
  keyLocation: string;
  /** Absolute https URLs to submit; all must belong to `host`. */
  urlList: string[];
}

/**
 * Build the exact IndexNow request payload. `keyLocation` follows the spec: the
 * key file must be served at that URL with a body equal to the key.
 */
export function buildIndexNowPayload(
  urlList: string[],
  origin: string = resolveSiteOrigin(),
  key: string = resolveIndexNowKey(),
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
 * caller-supplied URLs blindly. Returns a de-duplicated list.
 */
export function filterUrlsForHost(candidates: readonly unknown[], host: string): string[] {
  const valid = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' && parsed.host === host) {
        valid.add(parsed.toString());
      }
    } catch {
      // Not a parseable URL — skip it.
    }
  }
  return [...valid];
}

export type SubmitResult =
  | { submitted: true; upstreamStatus: number; urlCount: number }
  | { submitted: false; upstreamStatus?: number; urlCount: number; reason: string };

/**
 * Submit URLs to IndexNow. Validates and normalizes against the site host,
 * enforces the 10,000-URL cap, performs the real POST, and reports the upstream
 * status verbatim. Never throws — all failures return `submitted: false`.
 */
export async function submitUrls(urls: readonly string[]): Promise<SubmitResult> {
  const origin = resolveSiteOrigin();
  const host = new URL(origin).host;
  const urlList = filterUrlsForHost(urls, host);

  if (urlList.length === 0) {
    return {
      submitted: false,
      urlCount: 0,
      reason: `No valid https URLs on host ${host} were provided`,
    };
  }

  if (urlList.length > MAX_URLS_PER_REQUEST) {
    return {
      submitted: false,
      urlCount: urlList.length,
      reason: `Too many URLs: ${urlList.length} exceeds the IndexNow limit of ${MAX_URLS_PER_REQUEST}`,
    };
  }

  const payload = buildIndexNowPayload(urlList, origin);

  try {
    const upstream = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });

    if (upstream.ok) {
      return { submitted: true, upstreamStatus: upstream.status, urlCount: urlList.length };
    }
    return {
      submitted: false,
      upstreamStatus: upstream.status,
      urlCount: urlList.length,
      reason: `IndexNow returned HTTP ${upstream.status}`,
    };
  } catch (error) {
    return {
      submitted: false,
      urlCount: urlList.length,
      reason: error instanceof Error ? error.message : 'IndexNow request failed',
    };
  }
}

/** Convenience single-URL wrapper around {@link submitUrls}. */
export function submitUrl(url: string): Promise<SubmitResult> {
  return submitUrls([url]);
}
