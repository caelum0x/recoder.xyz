'use client';

import { useState, useMemo } from 'react';
import { Bell, CheckCheck, BellOff } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
} from '@/hooks/platform/use-notifications';
import type { PlatformNotification } from '@/lib/api/platform-notifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_APP_COLORS: Record<PlatformNotification['sourceApp'], string> = {
  agents: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  agency: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  pm: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  web: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

const SOURCE_APP_LABELS: Record<PlatformNotification['sourceApp'], string> = {
  agents: 'Agents',
  agency: 'Agency',
  pm: 'PM',
  web: 'Web',
};

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function truncateMessage(message: string, maxLength = 80): string {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength).trimEnd() + '...';
}

// ---------------------------------------------------------------------------
// Date grouping helpers
// ---------------------------------------------------------------------------

type DateGroup = 'Today' | 'Yesterday' | 'This Week' | 'Older';

function getDateGroup(dateString: string): DateGroup {
  const date = new Date(dateString);
  const now = new Date();

  // Reset times to midnight for accurate day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const notifDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (notifDate >= today) return 'Today';
  if (notifDate >= yesterday) return 'Yesterday';
  if (notifDate >= weekAgo) return 'This Week';
  return 'Older';
}

const DATE_GROUP_ORDER: DateGroup[] = ['Today', 'Yesterday', 'This Week', 'Older'];

function groupNotifications(
  notifications: PlatformNotification[],
): { group: DateGroup; items: PlatformNotification[] }[] {
  const grouped = new Map<DateGroup, PlatformNotification[]>();

  for (const n of notifications) {
    const group = getDateGroup(n.createdAt);
    if (!grouped.has(group)) {
      grouped.set(group, []);
    }
    grouped.get(group)!.push(n);
  }

  return DATE_GROUP_ORDER
    .filter((g) => grouped.has(g))
    .map((g) => ({ group: g, items: grouped.get(g)! }));
}

// ---------------------------------------------------------------------------
// Navigation helper
// ---------------------------------------------------------------------------

function navigateToNotification(notification: PlatformNotification) {
  if (notification.actionUrl) {
    // External or absolute URLs open in a new tab
    if (
      notification.actionUrl.startsWith('http://') ||
      notification.actionUrl.startsWith('https://')
    ) {
      window.open(notification.actionUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Relative paths navigate in the same window
      window.location.href = notification.actionUrl;
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NotificationSkeleton() {
  return (
    <div className="space-y-3 p-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-5 w-12 rounded-md shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: PlatformNotification;
  onRead: (id: string) => void;
}) {
  const handleClick = () => {
    if (!notification.read) {
      onRead(notification.id);
    }
    navigateToNotification(notification);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'w-full text-left flex gap-3 px-3 py-2.5 rounded-lg transition-all',
        'hover:bg-accent/50 active:scale-[0.99]',
        notification.read ? 'opacity-70' : 'bg-muted/30',
      )}
    >
      {/* Source app badge */}
      <span
        className={cn(
          'mt-0.5 shrink-0 inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none',
          SOURCE_APP_COLORS[notification.sourceApp] || 'bg-muted text-muted-foreground',
        )}
      >
        {SOURCE_APP_LABELS[notification.sourceApp] || notification.sourceApp}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className={cn('text-[13px] leading-tight', notification.read ? 'font-normal' : 'font-medium')}>
          {notification.title}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {truncateMessage(notification.message)}
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          {getRelativeTime(notification.createdAt)}
        </p>
      </div>

      {/* Unread indicator */}
      {!notification.read && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}

function DateGroupHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 bg-popover/95 backdrop-blur-sm px-3 py-1.5 border-b border-border/30">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  const grouped = useMemo(() => groupNotifications(notifications), [notifications]);

  const handleMarkRead = (id: string) => {
    markRead.mutate({ id });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-[360px] p-0 overflow-hidden"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-2.5">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
              className={cn(
                'flex items-center gap-1 text-[11px] font-medium text-muted-foreground',
                'hover:text-foreground transition-colors',
                markAllRead.isPending && 'opacity-50 pointer-events-none',
              )}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <NotificationSkeleton />
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="rounded-full bg-muted/50 p-3 mb-3">
              <BellOff className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No notifications yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
              You&apos;ll see updates here when your agents complete tasks, receive messages, or when there are important alerts.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                <DateGroupHeader label={group} />
                <div className="space-y-0.5 p-1.5">
                  {items.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onRead={handleMarkRead}
                    />
                  ))}
                </div>
              </div>
            ))}
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
