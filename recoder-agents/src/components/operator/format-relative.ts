/**
 * Format an ISO-8601 timestamp as a short relative-time string
 * (e.g. "just now", "5m ago", "3h ago", "2d ago").
 *
 * Shared by the operator panels (agent registry, run history, pending work)
 * so the relative-time rendering stays consistent in one place.
 *
 * @param iso        ISO-8601 timestamp, or undefined/empty.
 * @param emptyLabel Value returned when `iso` is missing or unparseable.
 *                   Defaults to an empty string; pass `'never'` for the
 *                   agent-registry "last seen" rendering.
 */
export function formatRelative(iso: string | undefined, emptyLabel = ''): string {
  if (!iso) return emptyLabel;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return emptyLabel;
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
