/**
 * Compact relative-time formatter shared by the Conductor monitor components.
 * Degrades to an empty string on an unparseable input.
 */
export function relativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    if (Number.isNaN(diffMs)) return '';
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}
