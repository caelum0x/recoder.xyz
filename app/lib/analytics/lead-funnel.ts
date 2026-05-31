/**
 * Lead-funnel aggregation helpers.
 *
 * Pure functions extracted from the admin KPI route so the conversion math
 * and source bucketing can be unit-tested without a database. The route
 * supplies raw counts / grouped rows; these helpers shape them into the
 * KPI response.
 */

/** Canonical lead-source buckets surfaced in the funnel KPI. */
export type LeadSourceBucket = 'homepage' | 'signupPage' | 'other';

/** A `(source, count)` pair as returned by a Prisma `groupBy`. */
export interface LeadSourceCount {
  source: string | null;
  count: number;
}

/**
 * Lead → signup conversion rate as a whole-number percentage (0-100).
 *
 * Returns `null` when there are no leads yet (rate is undefined, not zero),
 * so dashboards can show "—" instead of a misleading 0%.
 */
export function conversionRatePct(converted: number, total: number): number | null {
  if (!Number.isFinite(converted) || !Number.isFinite(total)) return null;
  if (total <= 0) return null;
  const clamped = Math.max(0, Math.min(converted, total));
  return Math.round((clamped / total) * 100);
}

/**
 * Map a raw `source` string to one of the canonical funnel buckets.
 *
 * Anything containing "signup" is treated as the signup-page form; anything
 * containing "home" as the homepage form; everything else (including null /
 * legacy "website") falls into "other".
 */
export function classifyLeadSource(source: string | null | undefined): LeadSourceBucket {
  const s = (source ?? '').toLowerCase();
  if (s.includes('signup')) return 'signupPage';
  if (s.includes('home')) return 'homepage';
  return 'other';
}

/** Counts of leads per canonical bucket. Always returns all three keys. */
export interface LeadsBySource {
  homepage: number;
  signupPage: number;
  other: number;
}

/**
 * Fold a list of `(source, count)` rows into the three canonical buckets.
 * Unknown / null sources accumulate into "other".
 */
export function summarizeLeadsBySource(rows: readonly LeadSourceCount[]): LeadsBySource {
  const totals: LeadsBySource = { homepage: 0, signupPage: 0, other: 0 };
  for (const row of rows) {
    const count = Number.isFinite(row.count) ? Math.max(0, row.count) : 0;
    totals[classifyLeadSource(row.source)] += count;
  }
  return totals;
}
