#!/usr/bin/env node
/**
 * Bing Webmaster Submission API sweep (degrade-truthful).
 *
 * Reads the deployed sitemap's URL list and submits it to the Bing Webmaster
 * Submission API. This is a SEPARATE, quota-limited channel from IndexNow
 * (`ping-indexnow.mjs`) — IndexNow already feeds Bing crawl with no quota, so run
 * this only when a direct Bing submit is explicitly wanted. Capped per run so a
 * single sweep can never blow the small daily quota (~100 URLs/day).
 *
 * Truthfulness contract (load-bearing): performs the real HTTP POST and prints
 * the upstream status verbatim. A non-2xx upstream (or a missing key) is reported
 * as a failure, not success. Nothing is ever fabricated.
 *
 * This is plain `.mjs` so it can run in a bare deploy hook without a TS build.
 *
 * Env:
 *   BING_WEBMASTER_API_KEY  (REQUIRED secret; without it the script exits 0 as a
 *                            truthful no-op so a deploy hook never fails on it)
 *   NEXT_PUBLIC_SITE_URL    (optional origin override; falls back to SITE_URL)
 *   SITE_URL                (optional origin override)
 *
 * Usage: node scripts/bing-submit.mjs
 */

const BING_SUBMIT_BATCH_ENDPOINT = 'https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch';
const CANONICAL_ORIGIN = 'https://recoder.xyz';
const MAX_BING_URLS_PER_RUN = 100;

function resolveSiteOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (fromEnv && /^https:\/\//.test(fromEnv)) {
    return fromEnv.replace(/\/+$/, '');
  }
  return CANONICAL_ORIGIN;
}

/** Extract absolute URLs on `host` from a sitemap.xml body's <loc> entries. */
function extractSitemapUrls(xml, host) {
  const urls = new Set();
  const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let match;
  while ((match = locRe.exec(xml)) !== null) {
    try {
      const parsed = new URL(match[1]);
      if (parsed.protocol === 'https:' && parsed.host === host) {
        urls.add(parsed.toString());
      }
    } catch {
      // Skip unparseable <loc> values.
    }
  }
  return [...urls];
}

async function main() {
  const apiKey = (process.env.BING_WEBMASTER_API_KEY || '').trim();
  if (!apiKey) {
    // Truthful no-op: no key ⇒ nothing submitted, but never fail a deploy hook.
    console.log('[bing-submit] BING_WEBMASTER_API_KEY not set — skipped (no submission)');
    process.exit(0);
  }

  const origin = resolveSiteOrigin();
  const host = new URL(origin).host;

  let xml;
  try {
    const res = await fetch(`${origin}/sitemap.xml`, { redirect: 'follow' });
    if (!res.ok) {
      console.error(`[bing-submit] failed to fetch sitemap: HTTP ${res.status}`);
      process.exit(1);
    }
    xml = await res.text();
  } catch (error) {
    console.error(`[bing-submit] failed to fetch sitemap: ${error?.message || error}`);
    process.exit(1);
  }

  const urlList = extractSitemapUrls(xml, host).slice(0, MAX_BING_URLS_PER_RUN);
  if (urlList.length === 0) {
    console.error('[bing-submit] no URLs found in sitemap — nothing to submit');
    process.exit(1);
  }

  try {
    const res = await fetch(`${BING_SUBMIT_BATCH_ENDPOINT}?apikey=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ siteUrl: origin, urlList }),
    });
    if (res.ok) {
      console.log(`[bing-submit] submitted ${urlList.length} URLs — upstream HTTP ${res.status}`);
      process.exit(0);
    }
    console.error(`[bing-submit] submission not accepted — upstream HTTP ${res.status}`);
    process.exit(1);
  } catch (error) {
    console.error(`[bing-submit] request failed: ${error?.message || error}`);
    process.exit(1);
  }
}

main();
