/**
 * Bing Webmaster URL Submission API channel — a SECOND, secret-gated submission
 * path alongside IndexNow (`./indexnow.ts`).
 *
 * Unlike IndexNow (public key, no daily quota, fans out to Bing/Yandex/Seznam),
 * the Bing Webmaster Submission API:
 *  - authenticates with a SECRET `apikey` (`BING_WEBMASTER_API_KEY`) — NEVER
 *    committed; read from the deploy env only,
 *  - is capped at a small daily quota (typically 100 URLs/day),
 *  - talks only to Bing.
 *
 * IndexNow already delivers changed URLs to Bing for crawl, so this channel is a
 * supplementary DIRECT submit for when the quota-limited Bing path is explicitly
 * wanted (a deploy-time sweep or an admin submit) — it is intentionally NOT fired
 * on every CMS publish (that would exhaust the daily quota). See
 * docs/growth/SEARCH-SUBMISSION-RUNBOOK.md §2.
 *
 * Truthfulness contract (load-bearing): performs a REAL HTTP POST and reports the
 * upstream status verbatim. It NEVER fabricates a submission and NEVER throws —
 * no key, over-quota, or network/HTTP failures all come back as a typed result
 * with `submitted: false`.
 */

import { filterUrlsForHost, resolveSiteOrigin, type SubmitResult } from './indexnow';

/** Bing Webmaster batch URL submission endpoint (apikey passed as a query param). */
export const BING_SUBMIT_BATCH_ENDPOINT =
  'https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch';

/** Bing Webmaster remaining-quota endpoint. */
export const BING_QUOTA_ENDPOINT =
  'https://ssl.bing.com/webmaster/api.svc/json/GetUrlSubmissionQuota';

/**
 * Conservative per-run cap. Bing's daily URL-submission quota is small (100/day
 * for many sites); we cap each run so a single call can never blow the quota. If
 * the live remaining quota is smaller, {@link submitUrlsToBing} caps to that.
 */
export const MAX_BING_URLS_PER_RUN = 100;

/**
 * Resolve the Bing Webmaster API key from the environment. This is a SECRET and
 * has NO committed default — absent/blank env ⇒ `null` ⇒ the channel is a
 * truthful no-op (never a fabricated submit).
 */
export function resolveBingApiKey(): string | null {
  const key = (process.env.BING_WEBMASTER_API_KEY || '').trim();
  return key.length > 0 ? key : null;
}

/**
 * Whether a runtime Bing submission should actually POST. Requires the secret key
 * AND (production OR an explicit dev override) — mirrors the IndexNow dev gate so
 * local/CI runs never spend the live quota. Never throws, no network call.
 */
export function isBingSubmissionEnabled(): boolean {
  if (resolveBingApiKey() === null) return false;
  if ((process.env.BING_ENABLE_IN_DEV || '').trim() === '1') return true;
  return process.env.NODE_ENV === 'production';
}

/**
 * Best-effort remaining daily quota from Bing. Returns the reported `DailyQuota`,
 * or `null` if the key is absent or the call/parse fails (caller then falls back
 * to {@link MAX_BING_URLS_PER_RUN}). Never throws.
 */
export async function getBingDailyQuota(
  apiKey: string = resolveBingApiKey() ?? '',
  siteUrl: string = resolveSiteOrigin(),
): Promise<number | null> {
  if (!apiKey) return null;
  try {
    const url = `${BING_QUOTA_ENDPOINT}?apikey=${encodeURIComponent(apiKey)}&siteUrl=${encodeURIComponent(siteUrl)}`;
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const daily = (body as { d?: { DailyQuota?: unknown } } | null)?.d?.DailyQuota;
    return typeof daily === 'number' && Number.isFinite(daily) ? daily : null;
  } catch {
    return null;
  }
}

/**
 * Submit URLs to the Bing Webmaster Submission API. Validates/normalizes against
 * the site host, caps to the live remaining quota (or {@link MAX_BING_URLS_PER_RUN}),
 * performs the real POST, and reports the upstream status verbatim. Never throws —
 * missing key, over-quota, and network/HTTP failures all return `submitted: false`.
 */
export async function submitUrlsToBing(urls: readonly string[]): Promise<SubmitResult> {
  const apiKey = resolveBingApiKey();
  if (!apiKey) {
    return {
      submitted: false,
      urlCount: 0,
      reason: 'BING_WEBMASTER_API_KEY is not set — Bing submission skipped',
    };
  }

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

  // Cap to the live remaining daily quota when known, else the conservative run cap.
  const remaining = await getBingDailyQuota(apiKey, origin);
  const cap = Math.max(0, Math.min(remaining ?? MAX_BING_URLS_PER_RUN, MAX_BING_URLS_PER_RUN));
  if (cap === 0) {
    return {
      submitted: false,
      urlCount: urlList.length,
      reason: 'Bing daily URL-submission quota is exhausted',
    };
  }
  const capped = urlList.slice(0, cap);

  try {
    const upstream = await fetch(`${BING_SUBMIT_BATCH_ENDPOINT}?apikey=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ siteUrl: origin, urlList: capped }),
    });

    if (upstream.ok) {
      return { submitted: true, upstreamStatus: upstream.status, urlCount: capped.length };
    }
    return {
      submitted: false,
      upstreamStatus: upstream.status,
      urlCount: capped.length,
      reason: `Bing Submission API returned HTTP ${upstream.status}`,
    };
  } catch (error) {
    return {
      submitted: false,
      urlCount: capped.length,
      reason: error instanceof Error ? error.message : 'Bing Submission API request failed',
    };
  }
}

/** Convenience single-URL wrapper around {@link submitUrlsToBing}. */
export function submitUrlToBing(url: string): Promise<SubmitResult> {
  return submitUrlsToBing([url]);
}
