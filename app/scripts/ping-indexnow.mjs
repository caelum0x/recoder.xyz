#!/usr/bin/env node
/**
 * Post-deploy IndexNow ping (degrade-truthful).
 *
 * Reads the deployed sitemap's URL list and submits it to IndexNow, which also
 * feeds Bing crawl. Intended to run from a deploy hook AFTER the new build is
 * live so the crawled URLs reflect the shipped content.
 *
 * Truthfulness contract (load-bearing):
 * - If `INDEXNOW_KEY` is unset/empty the script logs `skipped: no key` and
 *   exits 0 WITHOUT making any network call. It never fabricates a ping.
 * - Otherwise it performs the real HTTP POST to IndexNow and prints the upstream
 *   status verbatim. A non-2xx upstream is reported as a failure, not success.
 *
 * The IndexNow key validation file must be served at `${origin}/${key}.txt`
 * with a body equal to the key. That file is generated from `INDEXNOW_KEY` at
 * deploy time — the committed `public/INDEXNOW_KEY.txt` is only a placeholder.
 *
 * Env:
 *   INDEXNOW_KEY          (required to do anything; absent ⇒ no-op)
 *   NEXT_PUBLIC_SITE_URL  (optional origin override; falls back to SITE_URL)
 *   SITE_URL              (optional origin override)
 *
 * Usage: node scripts/ping-indexnow.mjs
 */

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const CANONICAL_ORIGIN = 'https://recoder.xyz';
const MAX_URLS_PER_REQUEST = 10_000;

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
  const key = (process.env.INDEXNOW_KEY || '').trim();
  if (!key) {
    // Degrade-truthful no-op. No key ⇒ no ping, no fake submission.
    console.log('[indexnow] skipped: no key (INDEXNOW_KEY not set)');
    process.exit(0);
  }

  const origin = resolveSiteOrigin();
  const host = new URL(origin).host;

  let xml;
  try {
    const res = await fetch(`${origin}/sitemap.xml`, { redirect: 'follow' });
    if (!res.ok) {
      console.error(`[indexnow] failed to fetch sitemap: HTTP ${res.status}`);
      process.exit(1);
    }
    xml = await res.text();
  } catch (error) {
    console.error(`[indexnow] failed to fetch sitemap: ${error?.message || error}`);
    process.exit(1);
  }

  const urlList = extractSitemapUrls(xml, host).slice(0, MAX_URLS_PER_REQUEST);
  if (urlList.length === 0) {
    console.error('[indexnow] no URLs found in sitemap — nothing to submit');
    process.exit(1);
  }

  const payload = {
    host,
    key,
    keyLocation: `${origin}/${key}.txt`,
    urlList,
  };

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log(`[indexnow] submitted ${urlList.length} URLs — upstream HTTP ${res.status}`);
      process.exit(0);
    }
    console.error(`[indexnow] submission not accepted — upstream HTTP ${res.status}`);
    process.exit(1);
  } catch (error) {
    console.error(`[indexnow] request failed: ${error?.message || error}`);
    process.exit(1);
  }
}

main();
