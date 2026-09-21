// Centralized SEO helpers for the marketing site.
//
// Before this module, every page inlined its own metadata block and hand-rolled
// its JSON-LD (see the old /compare/[slug] and layout.tsx). That drifted: some
// pages set a canonical, some didn't; OG/twitter fields were copy-pasted with
// small differences. This module is the single source of truth so every page —
// especially the programmatic /compare, /alternatives, and /use-cases routes —
// emits an identical, correct <title>/description/canonical/OG/twitter and valid
// schema.org structured data.
//
// Editorial rule (shared with app/compare/comparisons.ts): every claim rendered
// through these builders must be verifiable about the real tool. These helpers
// only shape data; they never invent it.

import type { Metadata } from "next";

/** Canonical origin. Must match layout.tsx metadataBase. */
export const SITE_URL = "https://recoder.xyz";
export const SITE_NAME = "Recoder";

/**
 * SERP display budgets. Google renders roughly the first ~60 chars of a title
 * and ~160 of a description before truncating. We clamp at those limits so a
 * hand-authored value that runs long degrades to a clean, word-boundary cut
 * instead of a mid-word chop by the search engine.
 */
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;

/**
 * Clamp text to `max` characters on a word boundary, appending an ellipsis when
 * it had to cut. Returns the input untouched when it already fits, so short,
 * deliberately-authored strings pass through byte-for-byte.
 */
export function truncateMetadataText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  // Reserve one char for the ellipsis, then cut at the last space so we never
  // split a word.
  const hardCut = trimmed.slice(0, max - 1);
  const lastSpace = hardCut.lastIndexOf(" ");
  const body = lastSpace > max * 0.5 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${body.replace(/[\s,.;:—-]+$/, "")}…`;
}

/** Build an absolute URL for a site-relative path (canonical/OG/JSON-LD `@id`). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${suffix === "/" ? "" : suffix}`;
}

export interface CreateMetadataInput {
  /** The full intended <title>. Clamped to ~60 chars. */
  title: string;
  /** The meta description. Clamped to ~160 chars. */
  description: string;
  /** Site-relative path, e.g. "/alternatives/cursor-alternatives". */
  path: string;
  keywords?: readonly string[];
  /** Optional OG/twitter image. Omit to inherit the route's opengraph-image. */
  image?: string;
  /** OG type; "article" for content pages, "website" for hubs. */
  type?: "website" | "article";
}

/**
 * The one metadata builder every page calls. Guarantees an absolute canonical,
 * a consistent OpenGraph object (url/siteName/type), and a summary_large_image
 * twitter card. When `image` is omitted the route's file-based opengraph-image
 * (app/opengraph-image.tsx) still applies via Next's metadata merge, so we don't
 * override the shared social card unless a caller has a better one.
 */
export function createMetadata({
  title,
  description,
  path,
  keywords,
  image,
  type = "website",
}: CreateMetadataInput): Metadata {
  const clampedTitle = truncateMetadataText(title, MAX_TITLE);
  const clampedDescription = truncateMetadataText(description, MAX_DESCRIPTION);
  const url = absoluteUrl(path);
  const images = image ? [image] : undefined;

  return {
    title: clampedTitle,
    description: clampedDescription,
    ...(keywords && keywords.length > 0 ? { keywords: [...keywords] } : {}),
    alternates: { canonical: url },
    openGraph: {
      title: clampedTitle,
      description: clampedDescription,
      url,
      siteName: SITE_NAME,
      type,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: clampedTitle,
      description: clampedDescription,
      ...(images ? { images } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// JSON-LD builders. Each returns a plain object to hand to <JsonLd data={...}/>.
// Kept as builders (not inline literals) so every page type emits the same,
// valid schema.org shape.
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  name: string;
  /** Absolute URL for this crumb. */
  item: string;
}

/** BreadcrumbList from an ordered list of crumbs (Home first, current last). */
export function buildBreadcrumbJsonLd(
  items: readonly BreadcrumbItem[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

export interface FaqEntry {
  q: string;
  a: string;
}

/** FAQPage from a list of question/answer pairs. */
export function buildFaqJsonLd(
  faq: readonly FaqEntry[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export interface ArticleJsonLdInput {
  headline: string;
  description: string;
  /** Absolute canonical URL of the page. */
  url: string;
  /** Names of the real things the article is about (for `about`). */
  about?: readonly string[];
}

/** Article authored + published by the Recoder organization. */
export function buildArticleJsonLd({
  headline,
  description,
  url,
  about,
}: ArticleJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@id": `${SITE_URL}/#organization` },
    ...(about && about.length > 0
      ? { about: about.map((name) => ({ "@type": "Thing", name })) }
      : {}),
  };
}

export interface ItemListEntry {
  name: string;
  /** Absolute URL of the listed item. */
  url: string;
}

/** ItemList — tells crawlers a hub is a curated collection, not a link farm. */
export function buildItemListJsonLd(
  name: string,
  items: readonly ItemListEntry[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      url: entry.url,
    })),
  };
}

/**
 * A FACTUAL SoftwareApplication node for Recoder. Scoped to the /download page
 * (not the sitewide @graph) because it asserts an installable build: it is only
 * honest where the page itself describes that build.
 *
 * Every field here is verifiable from /download and docs/install: a macOS
 * (Apple Silicon / arm64) desktop app, signed with an Apple Developer ID and
 * notarized, with a free tier for local use and paid plans. We deliberately omit
 * aggregateRating (no real reviews) and softwareVersion (env-driven, may be
 * unset). The offer's price "0" is the genuinely-free local tier — not a claim
 * the whole product is free.
 */
export function buildSoftwareApplicationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS (Apple Silicon / arm64)",
    softwareRequirements: "macOS on Apple Silicon (arm64)",
    url: `${SITE_URL}/download`,
    downloadUrl: `${SITE_URL}/download`,
    description:
      "Recoder is a local-first desktop control plane for coding agents. Run Claude Code, Codex, Cursor's agent, opencode, Aider, and Gemini CLI in parallel isolated git worktrees, compare their diffs, and land one governed merge. Bring your own provider keys.",
    publisher: { "@id": `${SITE_URL}/#organization` },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free tier for local use; paid plans available.",
    },
  };
}
