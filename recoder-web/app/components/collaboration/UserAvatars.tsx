/**
 * UserAvatars Component
 *
 * Displays a stack of user avatars with online status indicators.
 * Supports different sizes and overflow handling.
 */

import { useMemo } from 'react';
import type { UserInfo } from '~/lib/collaboration/yjs-provider';
import type { PresenceStatus } from '~/lib/stores/collaboration';
import { getPresenceStatusColor } from '~/lib/stores/collaboration';
import { classNames } from '~/utils/classNames';

// Avatar size configurations
const SIZES = {
  xs: { avatar: 'w-5 h-5', text: 'text-[9px]', status: 'w-1.5 h-1.5', overlap: '-ml-1.5' },
  sm: { avatar: 'w-6 h-6', text: 'text-[10px]', status: 'w-2 h-2', overlap: '-ml-2' },
  md: { avatar: 'w-8 h-8', text: 'text-xs', status: 'w-2.5 h-2.5', overlap: '-ml-2.5' },
  lg: { avatar: 'w-10 h-10', text: 'text-sm', status: 'w-3 h-3', overlap: '-ml-3' },
  xl: { avatar: 'w-12 h-12', text: 'text-base', status: 'w-3.5 h-3.5', overlap: '-ml-4' },
} as const;

type AvatarSize = keyof typeof SIZES;

interface UserAvatarsProps {
  /** List of users to display */
  users: UserInfo[];
  /** Maximum number of avatars to show before overflow */
  maxVisible?: number;
  /** Avatar size */
  size?: AvatarSize;
  /** Show status indicator */
  showStatus?: boolean;
  /** Status for each user (by user ID) */
  statuses?: Record<string, PresenceStatus>;
  /** Stack direction */
  direction?: 'left' | 'right';
  /** Show border around avatars */
  bordered?: boolean;
  /** Border color class */
  borderColor?: string;
  /** Additional CSS classes */
  className?: string;
  /** Click handler for individual avatar */
  onAvatarClick?: (user: UserInfo) => void;
  /** Click handler for overflow indicator */
  onOverflowClick?: (hiddenUsers: UserInfo[]) => void;
}

export function UserAvatars({
  users,
  maxVisible = 4,
  size = 'md',
  showStatus = false,
  statuses = {},
  direction = 'left',
  bordered = true,
  borderColor = 'border-recoder-elements-background-depth-1',
  className,
  onAvatarClick,
  onOverflowClick,
}: UserAvatarsProps) {
  const sizeConfig = SIZES[size];

  // Split users into visible and hidden
  const { visible, hidden } = useMemo(() => {
    if (users.length <= maxVisible) {
      return { visible: users, hidden: [] };
    }
    return {
      visible: users.slice(0, maxVisible - 1),
      hidden: users.slice(maxVisible - 1),
    };
  }, [users, maxVisible]);

  if (users.length === 0) {
    return null;
  }

  return (
    <div
      className={classNames(
        'flex items-center',
        direction === 'right' && 'flex-row-reverse',
        className
      )}
    >
      {visible.map((user, index) => (
        <Avatar
          key={user.id}
          user={user}
          size={size}
          showStatus={showStatus}
          status={statuses[user.id]}
          bordered={bordered}
          borderColor={borderColor}
          overlap={index > 0}
          direction={direction}
          onClick={onAvatarClick ? () => onAvatarClick(user) : undefined}
        />
      ))}

      {hidden.length > 0 && (
        <OverflowIndicator
          count={hidden.length}
          size={size}
          bordered={bordered}
          borderColor={borderColor}
          direction={direction}
          onClick={onOverflowClick ? () => onOverflowClick(hidden) : undefined}
        />
      )}
    </div>
  );
}

// ============================================================================
// Avatar Component
// ============================================================================

interface AvatarProps {
  user: UserInfo;
  size: AvatarSize;
  showStatus?: boolean;
  status?: PresenceStatus;
  bordered?: boolean;
  borderColor?: string;
  overlap?: boolean;
  direction?: 'left' | 'right';
  onClick?: () => void;
}

function Avatar({
  user,
  size,
  showStatus,
  status,
  bordered,
  borderColor,
  overlap,
  direction,
  onClick,
}: AvatarProps) {
  const sizeConfig = SIZES[size];
  const initials = getInitials(user.name);
  const statusColor = status ? getPresenceStatusColor(status) : 'bg-gray-500';

  return (
    <div
      className={classNames(
        'relative flex-shrink-0',
        overlap && (direction === 'right' ? '-mr-2' : sizeConfig.overlap),
        onClick && 'cursor-pointer hover:z-10 transition-transform hover:scale-110'
      )}
      style={{ zIndex: overlap ? 'auto' : 1 }}
      onClick={onClick}
      title={user.name}
    >
      {/* Avatar image or initials */}
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.name}
          className={classNames(
            'rounded-full object-cover',
            sizeConfig.avatar,
            bordered && `border-2 ${borderColor}`
          )}
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}

      {/* Initials fallback (always rendered, hidden when image loads) */}
      <div
        className={classNames(
          'rounded-full flex items-center justify-center font-medium text-white',
          sizeConfig.avatar,
          sizeConfig.text,
          bordered && `border-2 ${borderColor}`,
          user.avatar && 'hidden'
        )}
        style={{ backgroundColor: user.color }}
      >
        {initials}
      </div>

      {/* Status indicator */}
      {showStatus && status && (
        <div
          className={classNames(
            'absolute bottom-0 right-0 rounded-full',
            'border-2',
            borderColor,
            sizeConfig.status,
            statusColor
          )}
        />
      )}
    </div>
  );
}

// ============================================================================
// Single Avatar (exported for individual use)
// ============================================================================

interface SingleAvatarProps {
  user: UserInfo;
  size?: AvatarSize;
  showStatus?: boolean;
  status?: PresenceStatus;
  bordered?: boolean;
  borderColor?: string;
  className?: string;
  onClick?: () => void;
}

export function SingleAvatar({
  user,
  size = 'md',
  showStatus = false,
  status,
  bordered = false,
  borderColor = 'border-recoder-elements-background-depth-1',
  className,
  onClick,
}: SingleAvatarProps) {
  return (
    <div className={className}>
      <Avatar
        user={user}
        size={size}
        showStatus={showStatus}
        status={status}
        bordered={bordered}
        borderColor={borderColor}
        onClick={onClick}
      />
    </div>
  );
}

// ============================================================================
// Overflow Indicator
// ============================================================================

interface OverflowIndicatorProps {
  count: number;
  size: AvatarSize;
  bordered?: boolean;
  borderColor?: string;
  direction?: 'left' | 'right';
  onClick?: () => void;
}

function OverflowIndicator({
  count,
  size,
  bordered,
  borderColor,
  direction,
  onClick,
}: OverflowIndicatorProps) {
  const sizeConfig = SIZES[size];

  return (
    <button
      className={classNames(
        'relative flex-shrink-0 rounded-full flex items-center justify-center',
        'bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary',
        'font-medium',
        sizeConfig.avatar,
        sizeConfig.text,
        direction === 'right' ? '-mr-2' : sizeConfig.overlap,
        bordered && `border-2 ${borderColor}`,
        onClick && 'cursor-pointer hover:bg-recoder-elements-background-depth-4 transition-colors'
      )}
      onClick={onClick}
      title={`${count} more collaborator${count > 1 ? 's' : ''}`}
    >
      +{count}
    </button>
  );
}

// ============================================================================
// Avatar with Label (for lists)
// ============================================================================

interface AvatarWithLabelProps {
  user: UserInfo;
  size?: AvatarSize;
  showStatus?: boolean;
  status?: PresenceStatus;
  subtitle?: string;
  className?: string;
  onClick?: () => void;
}

export function AvatarWithLabel({
  user,
  size = 'md',
  showStatus = false,
  status,
  subtitle,
  className,
  onClick,
}: AvatarWithLabelProps) {
  const sizeConfig = SIZES[size];

  return (
    <div
      className={classNames(
        'flex items-center gap-2',
        onClick && 'cursor-pointer hover:bg-recoder-elements-background-depth-2 rounded-lg p-1.5',
        className
      )}
      onClick={onClick}
    >
      <Avatar
        user={user}
        size={size}
        showStatus={showStatus}
        status={status}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-recoder-elements-textPrimary truncate">
          {user.name}
        </div>
        {subtitle && (
          <div className="text-xs text-recoder-elements-textSecondary truncate">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Utilities
// ============================================================================

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default UserAvatars;
