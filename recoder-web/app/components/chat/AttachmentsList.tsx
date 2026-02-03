/**
 * AttachmentsList Component
 * Enhanced display of attached files as styled pills/badges
 * Inspired by december's ChatInput component
 *
 * Features:
 * - File icon based on type
 * - File name (truncated if long)
 * - File size (formatted)
 * - Remove button on hover
 * - Total size calculation
 * - Image preview on hover
 */

import { memo, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import type { FileAttachment } from '~/lib/hooks/useAttachments';
import { classNames } from '~/utils/classNames';
import { formatFileSize, MAX_TOTAL_SIZE } from '~/lib/services/attachments';
import { totalSize as totalSizeStore } from '~/lib/stores/attachments';
import { getFileTypeIcon } from './FileDropZone';

interface AttachmentsListProps {
  attachments: FileAttachment[];
  onRemove: (index: number) => void;
  /** Whether to show the total size summary */
  showSummary?: boolean;
  /** Compact mode for smaller displays */
  compact?: boolean;
}

/**
 * Displays a list of attached files as styled pills/badges
 * Shows image previews on hover for image files
 */
export const AttachmentsList = memo(({
  attachments,
  onRemove,
  showSummary = true,
  compact = false,
}: AttachmentsListProps) => {
  const totalSize = useStore(totalSizeStore);

  // Calculate total size from attachments
  const calculatedTotalSize = useMemo(() => {
    return attachments.reduce((sum, att) => sum + att.file.size, 0);
  }, [attachments]);

  // Use store total size if available, otherwise calculate
  const displayTotalSize = totalSize || calculatedTotalSize;

  if (attachments.length === 0) return null;

  return (
    <div className={classNames('px-3', compact ? 'pt-2' : 'pt-3')}>
      {/* Summary header */}
      {showSummary && (
        <div className="flex items-center justify-between text-xs font-medium text-bolt-elements-textSecondary px-1 mb-2">
          <span className="flex items-center gap-1.5">
            <span className="i-ph:paperclip" />
            Attached files ({attachments.length})
          </span>
          <span className="flex items-center gap-1">
            <span>Total:</span>
            <span
              className={classNames(
                displayTotalSize > MAX_TOTAL_SIZE * 0.8
                  ? 'text-amber-500'
                  : 'text-bolt-elements-textTertiary',
              )}
            >
              {formatFileSize(displayTotalSize)}
            </span>
            <span className="text-bolt-elements-textTertiary opacity-50">
              / {formatFileSize(MAX_TOTAL_SIZE)}
            </span>
          </span>
        </div>
      )}

      {/* Attachments list */}
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment, index) => (
          <AttachmentPill
            key={`${attachment.file.name}-${index}`}
            attachment={attachment}
            onRemove={() => onRemove(index)}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
});

AttachmentsList.displayName = 'AttachmentsList';

/**
 * Individual attachment pill component
 */
interface AttachmentPillProps {
  attachment: FileAttachment;
  onRemove: () => void;
  compact?: boolean;
}

const AttachmentPill = memo(({ attachment, onRemove, compact }: AttachmentPillProps) => {
  const isImage = attachment.file.type.startsWith('image/');
  const iconClass = getFileTypeIcon(attachment.file.type);

  return (
    <div
      className={classNames(
        'group relative flex items-center gap-2',
        'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
        'backdrop-blur-sm rounded-lg',
        compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
        'border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive',
        'transition-all duration-200 ease-out',
        'shadow-sm hover:shadow-md',
      )}
      title={`${attachment.file.name} (${formatFileSize(attachment.file.size)})`}
    >
      {/* File icon or image preview */}
      <div className="flex items-center">
        {isImage ? (
          <div className="relative group/preview">
            {/* Small thumbnail */}
            <img
              src={attachment.previewUrl || URL.createObjectURL(attachment.file)}
              alt={attachment.file.name}
              className={classNames(
                'object-cover rounded',
                compact ? 'w-4 h-4' : 'w-5 h-5',
              )}
            />
            {/* Larger preview on hover */}
            <div
              className={classNames(
                'absolute hidden group-hover/preview:block',
                'bottom-full left-0 mb-2 z-[60]',
                'animate-fade-in',
              )}
            >
              <div className="relative">
                <img
                  src={attachment.previewUrl || URL.createObjectURL(attachment.file)}
                  alt={attachment.file.name}
                  className={classNames(
                    'max-w-[240px] max-h-[240px] object-contain',
                    'bg-bolt-elements-background-depth-1 p-1.5 rounded-lg',
                    'shadow-xl border border-bolt-elements-borderColor',
                  )}
                />
                {/* File name tooltip */}
                <div
                  className={classNames(
                    'absolute -bottom-6 left-0 right-0',
                    'text-xs text-center text-bolt-elements-textSecondary',
                    'truncate px-2',
                  )}
                >
                  {attachment.file.name}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={classNames(iconClass, compact ? 'text-sm' : 'text-base')} />
        )}
      </div>

      {/* File info */}
      <div className="flex flex-col min-w-0 gap-0.5">
        <span
          className={classNames(
            'text-bolt-elements-textPrimary font-medium truncate',
            compact ? 'max-w-24' : 'max-w-32',
          )}
        >
          {attachment.file.name}
        </span>
        <span className="text-bolt-elements-textTertiary text-[10px]">
          {formatFileSize(attachment.file.size)}
        </span>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={classNames(
          'flex items-center justify-center',
          compact ? 'w-4 h-4' : 'w-5 h-5',
          'rounded-full',
          'text-bolt-elements-textTertiary',
          'opacity-50 group-hover:opacity-100',
          'hover:bg-red-500/10 hover:text-red-500',
          'transition-all duration-200',
        )}
        aria-label={`Remove ${attachment.file.name}`}
        title="Remove file"
      >
        <span className={classNames('i-ph:x', compact ? 'text-xs' : 'text-sm')} />
      </button>
    </div>
  );
});

AttachmentPill.displayName = 'AttachmentPill';

/**
 * Inline attachment count badge (for use in buttons/headers)
 */
export const AttachmentBadge = memo(({ count }: { count: number }) => {
  if (count === 0) return null;

  return (
    <span
      className={classNames(
        'inline-flex items-center justify-center',
        'min-w-[18px] h-[18px] px-1.5',
        'bg-blue-500 text-white',
        'text-xs font-medium rounded-full',
        'animate-scale-in',
      )}
    >
      {count}
    </span>
  );
});

AttachmentBadge.displayName = 'AttachmentBadge';

/**
 * Progress bar for attachment processing
 */
export const AttachmentProgress = memo(({ progress }: { progress: number }) => {
  return (
    <div className="w-full h-1 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
      <div
        className={classNames(
          'h-full bg-blue-500 rounded-full',
          'transition-all duration-300 ease-out',
        )}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
});

AttachmentProgress.displayName = 'AttachmentProgress';
