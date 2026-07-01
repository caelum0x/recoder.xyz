import { getChangelog, type ChangelogEntry } from "../changelog/entries";

const SITE_URL = "https://recoder.xyz";
const FEED_TITLE = "Recoder changelog";
const FEED_DESCRIPTION =
  "What's new in Recoder, the control plane for coding agents.";

/** Escapes the five XML predefined entities so user copy never breaks the feed. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Converts an ISO calendar date (YYYY-MM-DD) to an RFC-822 pubDate.
 *
 * Changelog entries are hand-edited, so a malformed date is a realistic input.
 * A bad date would make `new Date(...)` return an Invalid Date whose
 * `.toUTCString()` is the literal "Invalid Date" — that silently emits an
 * invalid RSS feed that readers reject. Instead we fall back to a valid RFC-822
 * timestamp (`fallback`, the feed build time) so the feed stays parseable and
 * the failure is visible in logs rather than as broken output.
 */
function toRfc822(date: string, fallback: string): string {
  // Treat the calendar date as midnight UTC for a stable, deterministic feed.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    console.error(`Invalid changelog date in RSS feed: ${JSON.stringify(date)}`);
    return fallback;
  }
  return parsed.toUTCString();
}

function renderItem(entry: ChangelogEntry, fallbackDate: string): string {
  const link = `${SITE_URL}/changelog#${encodeURIComponent(entry.version)}`;
  const body = entry.items.map((i) => `• ${i}`).join("\n");
  return [
    "    <item>",
    `      <title>${escapeXml(`${entry.version} — ${entry.title}`)}</title>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
    `      <pubDate>${toRfc822(entry.date, fallbackDate)}</pubDate>`,
    `      <description>${escapeXml(body)}</description>`,
    "    </item>",
  ].join("\n");
}

export function GET(): Response {
  const entries = getChangelog();
  // A guaranteed-valid RFC-822 timestamp used as the fallback whenever a
  // hand-edited changelog date fails to parse, so the feed never emits garbage.
  const now = new Date().toUTCString();
  const lastBuildDate =
    entries.length > 0 ? toRfc822(entries[0].date, now) : now;

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(FEED_TITLE)}</title>`,
    `    <link>${SITE_URL}/changelog</link>`,
    `    <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />`,
    entries.map((entry) => renderItem(entry, now)).join("\n"),
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
