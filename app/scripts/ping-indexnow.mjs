#!/usr/bin/env node
/**
 * Post-deploy IndexNow ping (degrade-truthful).
 *
 * Reads the deployed sitemap's URL list and submits it to IndexNow, which also
 * feeds Bing crawl. Intended to run from a deploy hook AFTER the new build is
 * live so the crawled URLs reflect the shipped content.
 *
 * Truthfulness contract (load-bearing): it performs the real HTTP POST to
 * IndexNow and prints the upstream status verbatim. A non-2xx upstream is
 * reported as a failure, not success. Nothing is ever fabricated.
 *
 * Key: the committed public default (`DEFAULT_INDEXNOW_KEY` in
 * app/lib/seo/indexnow.ts, also served at `public/<key>.txt`) is used unless a
 * valid `INDEXNOW_KEY` env value overrides it (rotation). The constant below
 * MUST stay in lockstep with that module and the committed key file. This script
 * is plain `.mjs` so it can run in a bare deploy hook without a TS build step,
 * which is why the constant is duplicated rather than imported.
 *
 * Env:
 *   INDEXNOW_KEY          (optional rotation override; must be 8-128 [a-zA-Z0-9-])
 *   NEXT_PUBLIC_SITE_URL  (optional origin override; falls back to SITE_URL)
 *   SITE_URL              (optional origin override)
 *
 * Usage: node scripts/ping-indexnow.mjs
 */

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const CANONICAL_ORIGIN = 'https://recoder.xyz';
const MAX_URLS_PER_REQUEST = 10_000;
// Keep in lockstep with DEFAULT_INDEXNOW_KEY in app/lib/seo/indexnow.ts.
const DEFAULT_INDEXNOW_KEY = 'fc855a24fb8ed402c70b39f17fe8b444';
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

function resolveIndexNowKey() {
  const fromEnv = (process.env.INDEXNOW_KEY || '').trim();
  return fromEnv && KEY_PATTERN.test(fromEnv) ? fromEnv : DEFAULT_INDEXNOW_KEY;
}

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
  const key = resolveIndexNowKey();
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
