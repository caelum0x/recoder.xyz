import { memo, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import {
  notificationsStore,
  notificationsPanelOpen,
  closeNotificationsPanel,
  toggleNotificationsPanel,
  markAsRead,
  markAllAsRead,
  removeNotification,
  clearAll,
  formatRelativeTime,
  type NotificationType,
} from '~/lib/stores/notifications';

// Icon mapping for notification types
const TYPE_ICONS: Record<NotificationType, string> = {
  info: 'i-ph:info',
  success: 'i-ph:check-circle',
  warning: 'i-ph:warning',
  error: 'i-ph:x-circle',
};

// Color classes for notification types
const TYPE_COLORS: Record<NotificationType, { icon: string; bg: string; border: string }> = {
  info: {
    icon: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  success: {
    icon: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
  },
  warning: {
    icon: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
  },
  error: {
    icon: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  },
};

interface NotificationItemProps {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  onMarkAsRead: (id: string) => void;
  onRemove: (id: string) => void;
}

const NotificationItem = memo(({
  id,
  type,
  title,
  message,
  timestamp,
  read,
  onMarkAsRead,
  onRemove,
}: NotificationItemProps) => {
  const colors = TYPE_COLORS[type];

  return (
    <div
      className={classNames(
        'relative p-3 rounded-lg border transition-all hover:border-bolt-elements-borderColor group',
        colors.bg,
        colors.border,
        !read && 'ring-1 ring-blue-500/50'
      )}
      onClick={() => !read && onMarkAsRead(id)}
    >
      {/* Unread indicator */}
      {!read && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      )}

      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={classNames(TYPE_ICONS[type], 'text-lg mt-0.5 shrink-0', colors.icon)} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={classNames(
              'text-sm font-medium truncate',
              read ? 'text-bolt-elements-textSecondary' : 'text-bolt-elements-textPrimary'
            )}>
              {title}
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-all shrink-0"
              aria-label="Remove notification"
            >
              <div className="i-ph:x text-sm" />
            </button>
          </div>
          <p className={classNames(
            'text-sm mt-0.5 line-clamp-2',
            read ? 'text-bolt-elements-textTertiary' : 'text-bolt-elements-textSecondary'
          )}>
            {message}
          </p>
          <span className="text-xs text-bolt-elements-textTertiary mt-1 block">
            {formatRelativeTime(timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
});

NotificationItem.displayName = 'NotificationItem';

export const NotificationBell = memo(() => {
  const { unreadCount } = useStore(notificationsStore);
  const isOpen = useStore(notificationsPanelOpen);

  return (
    <button
      onClick={toggleNotificationsPanel}
      className={classNames(
        'relative p-2 rounded-md transition-colors',
        isOpen
          ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
          : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3'
      )}
      title="Notifications"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
    >
      <div className={classNames(
        'text-xl',
        unreadCount > 0 ? 'i-ph:bell-ringing' : 'i-ph:bell'
      )} />

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-red-500 text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
});

NotificationBell.displayName = 'NotificationBell';

export const NotificationCenter = memo(() => {
  const { notifications, unreadCount } = useStore(notificationsStore);
  const isOpen = useStore(notificationsPanelOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Check if the click was on the bell button (don't close if so)
        const bellButton = (e.target as Element)?.closest('[aria-label*="Notifications"]');
        if (!bellButton) {
          closeNotificationsPanel();
        }
      }
    };

    // Close on escape
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeNotificationsPanel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 mt-2 w-96 max-h-[500px] rounded-xl shadow-2xl z-[100] flex flex-col overflow-hidden bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center gap-2">
          <div className="i-ph:bell text-lg text-bolt-elements-textPrimary" />
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">
            Notifications
          </h3>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-blue-500 text-white">
              {unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-2 py-1 text-xs font-medium rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors"
              title="Mark all as read"
            >
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="px-2 py-1 text-xs font-medium rounded-md text-bolt-elements-textSecondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Clear all notifications"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Notifications list */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="i-ph:bell-slash text-4xl text-bolt-elements-textTertiary mb-3" />
            <p className="text-sm text-bolt-elements-textSecondary">No notifications</p>
            <p className="text-xs text-bolt-elements-textTertiary mt-1">
              You're all caught up!
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {notifications.map(notification => (
              <NotificationItem
                key={notification.id}
                {...notification}
                onMarkAsRead={markAsRead}
                onRemove={removeNotification}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
          <p className="text-xs text-bolt-elements-textTertiary text-center">
            Showing {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
});

NotificationCenter.displayName = 'NotificationCenter';
