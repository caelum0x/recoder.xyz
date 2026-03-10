export const PAGE_SIZE = 20;

export const APP_FILTERS = [
  { key: undefined, label: 'All' },
  { key: 'agents', label: 'Agents' },
  { key: 'agency', label: 'Agency' },
  { key: 'pm', label: 'PM' },
] as const;

export const DATE_FILTERS = [
  { key: 'all' as const, label: 'All Time' },
  { key: 'today' as const, label: 'Today' },
  { key: 'week' as const, label: 'This Week' },
  { key: 'month' as const, label: 'This Month' },
] as const;

export const APP_BADGE_STYLES: Record<string, string> = {
  agents: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  agency: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  pm: 'bg-green-500/15 text-green-600 dark:text-green-400',
  web: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
};

export const TYPE_LABELS: Record<string, string> = {
  'agent.task.completed': 'Task',
  'agent.thread.created': 'Thread',
  'agent.error.occurred': 'Error',
  thread: 'Thread',
};

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
