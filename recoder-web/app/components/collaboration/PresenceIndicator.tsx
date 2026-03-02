/**
 * PresenceIndicator Component
 *
 * Displays the online status of collaborators in a project.
 * Shows a compact indicator that expands to show all online users.
 */

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  collaboratorsList,
  onlineCount,
  activeCount,
  collaborationConnection,
  collaborationSettings,
  getPresenceStatusColor,
  getPresenceStatusText,
  type CollaboratorPresence,
} from '~/lib/stores/collaboration';
import { classNames } from '~/utils/classNames';
import { UserAvatars } from './UserAvatars';

interface PresenceIndicatorProps {
  /** Maximum number of avatars to show in compact mode */
  maxAvatars?: number;
  /** Show connection status indicator */
  showConnectionStatus?: boolean;
  /** Click handler for the indicator */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Show as compact (just avatars) or expanded (with names) */
  variant?: 'compact' | 'expanded';
}

export function PresenceIndicator({
  maxAvatars = 3,
  showConnectionStatus = true,
  onClick,
  className,
  variant = 'compact',
}: PresenceIndicatorProps) {
  const collaborators = useStore(collaboratorsList);
  const online = useStore(onlineCount);
  const active = useStore(activeCount);
  const connection = useStore(collaborationConnection);
  const settings = useStore(collaborationSettings);

  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Don't show if collaboration is disabled or no online users
  if (!settings.showPresence || (online === 0 && connection === 'disconnected')) {
    return null;
  }

  const connectionColor = getConnectionStatusColor(connection);
  const connectionText = getConnectionStatusText(connection);

  if (variant === 'expanded') {
    return (
      <div
        className={classNames(
          'flex flex-col gap-2 p-3 rounded-lg bg-recoder-elements-background-depth-2',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-recoder-elements-textPrimary">
              Collaborators
            </span>
            {showConnectionStatus && (
              <div className="flex items-center gap-1.5">
                <div
                  className={classNames(
                    'w-2 h-2 rounded-full',
                    connectionColor
                  )}
                />
                <span className="text-xs text-recoder-elements-textSecondary">
                  {connectionText}
                </span>
              </div>
            )}
          </div>
          <span className="text-xs text-recoder-elements-textSecondary">
            {online} online
          </span>
        </div>

        {/* Collaborator list */}
        {collaborators.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {collaborators.map((collab) => (
              <CollaboratorRow key={collab.clientId} collaborator={collab} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-recoder-elements-textSecondary py-2">
            No other collaborators online
          </div>
        )}
      </div>
    );
  }

  // Compact variant
  return (
    <div
      className={classNames('relative', className)}
      onMouseEnter={() => {
        setIsHovered(true);
        setShowTooltip(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setTimeout(() => setShowTooltip(false), 200);
      }}
    >
      <button
        onClick={onClick}
        className={classNames(
          'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all',
          'hover:bg-recoder-elements-background-depth-2',
          onClick && 'cursor-pointer'
        )}
      >
        {/* Connection indicator */}
        {showConnectionStatus && (
          <div
            className={classNames(
              'w-2 h-2 rounded-full transition-colors',
              connectionColor
            )}
            title={connectionText}
          />
        )}

        {/* Avatars */}
        <UserAvatars
          users={collaborators.map((c) => c.user)}
          maxVisible={maxAvatars}
          size="sm"
          showStatus
          statuses={collaborators.reduce(
            (acc, c) => ({ ...acc, [c.user.id]: c.status }),
            {}
          )}
        />

        {/* Count badge */}
        {online > maxAvatars && (
          <span className="text-xs text-recoder-elements-textSecondary">
            +{online - maxAvatars}
          </span>
        )}
      </button>

      {/* Hover tooltip */}
      {showTooltip && collaborators.length > 0 && (
        <div
          ref={tooltipRef}
          className={classNames(
            'absolute top-full right-0 mt-2 z-50',
            'min-w-[200px] max-w-[300px] p-3',
            'bg-recoder-elements-background-depth-3 rounded-lg shadow-lg',
            'border border-recoder-elements-borderColor',
            'animate-in fade-in slide-in-from-top-2 duration-200'
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-recoder-elements-textPrimary">
              Online ({online})
            </span>
            {active < online && (
              <span className="text-xs text-recoder-elements-textSecondary">
                {active} active
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
            {collaborators.map((collab) => (
              <CollaboratorRow
                key={collab.clientId}
                collaborator={collab}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface CollaboratorRowProps {
  collaborator: CollaboratorPresence;
  compact?: boolean;
}

function CollaboratorRow({ collaborator, compact }: CollaboratorRowProps) {
  const { user, status, currentFile } = collaborator;
  const statusColor = getPresenceStatusColor(status);
  const statusText = getPresenceStatusText(status);

  return (
    <div
      className={classNames(
        'flex items-center gap-2',
        compact ? 'py-1' : 'py-1.5 px-2 rounded-md hover:bg-recoder-elements-background-depth-3'
      )}
    >
      {/* Avatar with status */}
      <div className="relative flex-shrink-0">
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="w-6 h-6 rounded-full"
          />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white"
            style={{ backgroundColor: user.color }}
          >
            {getInitials(user.name)}
          </div>
        )}
        <div
          className={classNames(
            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full',
            'border-2 border-recoder-elements-background-depth-2',
            statusColor
          )}
        />
      </div>

      {/* Name and file */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-recoder-elements-textPrimary truncate">
            {user.name}
          </span>
          {!compact && (
            <span className="text-xs text-recoder-elements-textTertiary">
              ({statusText})
            </span>
          )}
        </div>
        {currentFile && (
          <div className="text-xs text-recoder-elements-textSecondary truncate">
            {getFileName(currentFile)}
          </div>
        )}
      </div>

      {/* User color indicator */}
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: user.color }}
      />
    </div>
  );
}

// ============================================================================
// Utilities
// ============================================================================

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

function getConnectionStatusColor(connection: string): string {
  switch (connection) {
    case 'connected':
      return 'bg-green-500';
    case 'connecting':
    case 'reconnecting':
      return 'bg-yellow-500 animate-pulse';
    case 'disconnected':
    default:
      return 'bg-gray-500';
  }
}

function getConnectionStatusText(connection: string): string {
  switch (connection) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'reconnecting':
      return 'Reconnecting...';
    case 'disconnected':
    default:
      return 'Disconnected';
  }
}

export default PresenceIndicator;
