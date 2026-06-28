/**
 * Single source of truth for the Recoder changelog.
 *
 * Both the /changelog page and the /feed.xml RSS route render from this typed
 * array. To publish a release, prepend a new entry to the top of the list and
 * keep it sorted newest-first.
 */

export interface ChangelogEntry {
  /** Semantic version, also used as the in-page anchor id (e.g. "0.1.0"). */
  version: string;
  /** Release date as an ISO-8601 calendar date (YYYY-MM-DD). */
  date: string;
  /** Short human-readable headline for the release. */
  title: string;
  /** Bullet points describing what shipped. */
  items: string[];
}

export const CHANGELOG: ReadonlyArray<ChangelogEntry> = [
  {
    version: "0.1.0",
    date: "2026-06-24",
    title: "The coordination layer takes shape",
    items: [
      "Locked the direction: Recoder coordinates your own coding agents instead of being one.",
      "Shared brain, work-locks, and A2A bus designed over the owned control plane.",
      "New recoder.xyz site.",
    ],
  },
];

/** Returns changelog entries sorted newest-first by date, then version. */
export function getChangelog(): ReadonlyArray<ChangelogEntry> {
  return [...CHANGELOG].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.version < b.version ? 1 : -1;
  });
}
