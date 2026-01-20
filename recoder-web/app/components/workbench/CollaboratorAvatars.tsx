/**
 * Collaborator Avatars Component
 *
 * Displays avatars of users currently collaborating on the project
 * or the current file. Shows connection status, user presence, and
 * notifications for user join/leave events.
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useProjectCollaborators, useRemoteUsers, useCollaborationConnection, type RemoteUserState } from '~/lib/collaboration';
import type { UserInfo } from '~/lib/collaboration/yjs-provider';
import { classNames } from '~/utils/classNames';

// CSS keyframes for animations (injected once)
const collaboratorStyles = `
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutRight {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

@keyframes pulse-dot {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.1);
  }
}
`;

// Inject styles once
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = collaboratorStyles;
  document.head.appendChild(style);
  stylesInjected = true;
}

interface AvatarProps {
  user: RemoteUserState;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

/**
 * Individual collaborator avatar
 */
const Avatar = memo(({ user, size = 'md', showTooltip = true }: AvatarProps) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const borderWidth = {
    sm: '2px',
    md: '2px',
    lg: '3px',
  };

  const initials = user.user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative group">
      {user.user.avatar ? (
        <img
          src={user.user.avatar}
          alt={user.user.name}
          className={classNames(
            sizeClasses[size],
            'rounded-full object-cover'
          )}
          style={{
            border: `${borderWidth[size]} solid ${user.user.color}`,
          }}
        />
      ) : (
        <div
          className={classNames(
            sizeClasses[size],
            'rounded-full flex items-center justify-center font-medium text-white'
          )}
          style={{
            backgroundColor: user.user.color,
            border: `${borderWidth[size]} solid ${user.user.color}`,
          }}
        >
          {initials}
        </div>
      )}

      {/* Active indicator (pulsing dot) */}
      <div
        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-bolt-elements-background-depth-1"
        style={{
          animation: 'pulse 2s ease-in-out infinite',
        }}
      />

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
          <div className="font-medium">{user.user.name}</div>
          {user.currentFile && (
            <div className="text-bolt-elements-textSecondary text-[10px]">
              {user.currentFile.split('/').pop()}
            </div>
          )}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-1"
            style={{
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid var(--bolt-elements-background-depth-3)',
            }}
          />
        </div>
      )}
    </div>
  );
});

Avatar.displayName = 'Avatar';

/**
 * User event for join/leave notifications
 */
interface UserEvent {
  type: 'joined' | 'left';
  user: UserInfo;
  timestamp: number;
}

/**
 * Notification toast for user events
 */
const UserNotification = memo(({
  event,
  onDismiss,
}: {
  event: UserEvent;
  onDismiss: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={classNames(
        'flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm',
        'animate-in slide-in-from-right-full duration-300',
        event.type === 'joined'
          ? 'bg-green-500/20 border border-green-500/30 text-green-400'
          : 'bg-red-500/20 border border-red-500/30 text-red-400'
      )}
      style={{
        animation: 'slideInRight 0.3s ease-out',
      }}
    >
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white"
        style={{ backgroundColor: event.user.color }}
      >
        {event.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
      </div>
      <span className="font-medium">{event.user.name}</span>
      <span className="text-bolt-elements-textSecondary">
        {event.type === 'joined' ? 'joined' : 'left'}
      </span>
    </div>
  );
});

UserNotification.displayName = 'UserNotification';

/**
 * Container for user notifications
 */
const UserNotifications = memo(({
  events,
  onDismiss,
}: {
  events: UserEvent[];
  onDismiss: (timestamp: number) => void;
}) => {
  if (events.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {events.map((event) => (
        <div key={event.timestamp} className="pointer-events-auto">
          <UserNotification
            event={event}
            onDismiss={() => onDismiss(event.timestamp)}
          />
        </div>
      ))}
    </div>
  );
});

UserNotifications.displayName = 'UserNotifications';

interface CollaboratorAvatarsProps {
  /**
   * Show all project collaborators vs only users in current file
   */
  scope?: 'file' | 'project';

  /**
   * Maximum number of avatars to show before "+N" indicator
   */
  maxVisible?: number;

  /**
   * Avatar size
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Show connection status indicator
   */
  showConnectionStatus?: boolean;

  /**
   * Show user join/leave notifications
   */
  showNotifications?: boolean;

  /**
   * Callback when a user joins
   */
  onUserJoined?: (user: UserInfo) => void;

  /**
   * Callback when a user leaves
   */
  onUserLeft?: (user: UserInfo) => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Display collaborator avatars with connection status
 */
export const CollaboratorAvatars = memo(({
  scope = 'file',
  maxVisible = 5,
  size = 'md',
  showConnectionStatus = true,
  showNotifications = true,
  onUserJoined,
  onUserLeft,
  className,
}: CollaboratorAvatarsProps) => {
  const projectCollaborators = useProjectCollaborators();
  const remoteUsers = useRemoteUsers();
  const { state: connectionState, isSynced } = useCollaborationConnection();

  const users = scope === 'project' ? projectCollaborators : remoteUsers;

  // Inject styles on mount
  useEffect(() => {
    injectStyles();
  }, []);

  // Track user events for notifications
  const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
  const [previousUserIds, setPreviousUserIds] = useState<Set<string>>(new Set());
  const previousUsersRef = useRef<Map<string, UserInfo>>(new Map());

  // Detect user joins and leaves
  useEffect(() => {
    const currentUserIds = new Set(users.map(u => u.user.id));
    const now = Date.now();
    const newEvents: UserEvent[] = [];

    // Build current user map for tracking
    const currentUsersMap = new Map<string, UserInfo>();
    users.forEach((u) => currentUsersMap.set(u.user.id, u.user));

    // Find new users (joined)
    currentUserIds.forEach((userId) => {
      if (!previousUserIds.has(userId)) {
        const user = currentUsersMap.get(userId);
        if (user) {
          newEvents.push({ type: 'joined', user, timestamp: now + newEvents.length });
          onUserJoined?.(user);
        }
      }
    });

    // Find users who left (use previously stored user info)
    previousUserIds.forEach((userId) => {
      if (!currentUserIds.has(userId)) {
        const leftUser = previousUsersRef.current.get(userId);
        if (leftUser) {
          newEvents.push({ type: 'left', user: leftUser, timestamp: now + newEvents.length });
          onUserLeft?.(leftUser);
        }
      }
    });

    // Update stored user info for next comparison
    previousUsersRef.current = currentUsersMap;

    if (newEvents.length > 0 && showNotifications) {
      setUserEvents((prev) => [...prev.slice(-4), ...newEvents]); // Keep last 5 events
    }

    setPreviousUserIds(currentUserIds);
  }, [users, previousUserIds, onUserJoined, onUserLeft, showNotifications]);

  // Dismiss notification handler
  const handleDismissNotification = useCallback((timestamp: number) => {
    setUserEvents((prev) => prev.filter((e) => e.timestamp !== timestamp));
  }, []);

  if (users.length === 0 && !showConnectionStatus) {
    return null;
  }

  const visibleUsers = users.slice(0, maxVisible);
  const hiddenCount = Math.max(0, users.length - maxVisible);

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const overlapOffset = {
    sm: '-ml-2',
    md: '-ml-3',
    lg: '-ml-4',
  };

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return isSynced ? 'bg-green-500' : 'bg-yellow-500';
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-500';
      case 'disconnected':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return isSynced ? 'Connected' : 'Syncing...';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className={classNames('flex items-center', className)}>
      {/* Connection status indicator */}
      {showConnectionStatus && (
        <div className="flex items-center mr-3 group relative">
          <div
            className={classNames(
              'w-2 h-2 rounded-full',
              getConnectionStatusColor(),
              connectionState === 'connecting' || connectionState === 'reconnecting'
                ? 'animate-pulse'
                : ''
            )}
          />

          {/* Status tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
            {getConnectionStatusText()}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 -mt-1"
              style={{
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '4px solid var(--bolt-elements-background-depth-3)',
              }}
            />
          </div>
        </div>
      )}

      {/* Avatar stack */}
      {users.length > 0 && (
        <div className="flex items-center">
          {visibleUsers.map((user, index) => (
            <div
              key={user.clientId}
              className={classNames(index > 0 ? overlapOffset[size] : '')}
              style={{ zIndex: visibleUsers.length - index }}
            >
              <Avatar user={user} size={size} />
            </div>
          ))}

          {/* Hidden count indicator */}
          {hiddenCount > 0 && (
            <div
              className={classNames(
                sizeClasses[size],
                overlapOffset[size],
                'rounded-full flex items-center justify-center font-medium bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary border-2 border-bolt-elements-background-depth-1'
              )}
              style={{ zIndex: 0 }}
            >
              +{hiddenCount}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {users.length === 0 && (
        <span className="text-xs text-bolt-elements-textSecondary">
          {scope === 'file' ? 'No one else editing' : 'Only you'}
        </span>
      )}

      {/* User join/leave notifications */}
      {showNotifications && (
        <UserNotifications
          events={userEvents}
          onDismiss={handleDismissNotification}
        />
      )}
    </div>
  );
});

CollaboratorAvatars.displayName = 'CollaboratorAvatars';

/**
 * Compact collaborator count badge for use in tabs or headers
 */
export const CollaboratorBadge = memo(({
  scope = 'file',
  className,
}: {
  scope?: 'file' | 'project';
  className?: string;
}) => {
  const projectCollaborators = useProjectCollaborators();
  const remoteUsers = useRemoteUsers();

  const count = (scope === 'project' ? projectCollaborators : remoteUsers).length;

  if (count === 0) return null;

  return (
    <span
      className={classNames(
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium rounded-full bg-blue-500 text-white',
        className
      )}
    >
      {count}
    </span>
  );
});

CollaboratorBadge.displayName = 'CollaboratorBadge';

export default CollaboratorAvatars;
