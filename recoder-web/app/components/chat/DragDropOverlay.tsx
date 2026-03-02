/**
 * DragDropOverlay Component
 * Enhanced visual overlay shown when dragging files over the chat input area
 * Inspired by december's ChatInput component
 *
 * Features:
 * - Animated border and background
 * - Clear visual feedback
 * - Icon and instructional text
 * - Support for different states (valid, invalid)
 */

import { memo } from 'react';
import { classNames } from '~/utils/classNames';
import { formatFileSize, MAX_FILE_SIZE, MAX_TOTAL_SIZE } from '~/lib/services/attachments';

export type OverlayState = 'default' | 'valid' | 'invalid';

interface DragDropOverlayProps {
  /** Whether files are being dragged over the drop zone */
  isDraggingOver: boolean;
  /** Current overlay state for visual feedback */
  state?: OverlayState;
  /** Custom message to display */
  message?: string;
  /** Custom sub-message to display */
  subMessage?: string;
}

/**
 * Overlay shown when dragging files over the chat input area
 */
export const DragDropOverlay = memo(({
  isDraggingOver,
  state = 'default',
  message,
  subMessage,
}: DragDropOverlayProps) => {
  if (!isDraggingOver) return null;

  const isInvalid = state === 'invalid';
  const isValid = state === 'valid';

  const getIcon = () => {
    if (isInvalid) return 'i-ph:x-circle';
    if (isValid) return 'i-ph:check-circle';
    return 'i-ph:upload-simple';
  };

  const getIconColor = () => {
    if (isInvalid) return 'text-red-500 dark:text-red-400';
    if (isValid) return 'text-green-500 dark:text-green-400';
    return 'text-blue-500 dark:text-blue-400';
  };

  const getBgColor = () => {
    if (isInvalid) return 'bg-red-500/10 dark:bg-red-400/10';
    if (isValid) return 'bg-green-500/10 dark:bg-green-400/10';
    return 'bg-blue-500/10 dark:bg-blue-400/10';
  };

  const getBorderColor = () => {
    if (isInvalid) return 'border-red-500 dark:border-red-400';
    if (isValid) return 'border-green-500 dark:border-green-400';
    return 'border-blue-500 dark:border-blue-400';
  };

  const getTextColor = () => {
    if (isInvalid) return 'text-red-600 dark:text-red-400';
    if (isValid) return 'text-green-600 dark:text-green-400';
    return 'text-recoder-elements-textPrimary';
  };

  const getSubTextColor = () => {
    if (isInvalid) return 'text-red-500/70 dark:text-red-400/70';
    if (isValid) return 'text-green-500/70 dark:text-green-400/70';
    return 'text-recoder-elements-textSecondary';
  };

  const defaultMessage = isInvalid ? 'Unsupported file type' : 'Drop files to attach';
  const defaultSubMessage = isInvalid
    ? 'Please use supported file types'
    : 'Images, PDFs, and code files supported';

  return (
    <div
      className={classNames(
        'absolute inset-0 z-50 pointer-events-none',
        getBgColor(),
        'border-2 border-dashed',
        getBorderColor(),
        'rounded-lg flex items-center justify-center',
        'transition-all duration-200 ease-out',
        'animate-fade-in',
      )}
    >
      {/* Animated background pattern */}
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <div
          className={classNames(
            'absolute inset-0 opacity-[0.03]',
            'bg-[length:20px_20px]',
            'bg-[linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)]',
            'animate-grid-scroll',
          )}
        />
      </div>

      {/* Content card */}
      <div
        className={classNames(
          'relative bg-recoder-elements-background-depth-1 px-8 py-6 rounded-xl',
          'shadow-lg border border-recoder-elements-borderColor',
          'text-center transform',
          'animate-bounce-subtle',
        )}
      >
        {/* Icon with pulse animation */}
        <div className="relative mx-auto mb-3 w-12 h-12 flex items-center justify-center">
          <div
            className={classNames(
              'absolute inset-0 rounded-full',
              isInvalid ? 'bg-red-500/20' : isValid ? 'bg-green-500/20' : 'bg-blue-500/20',
              'animate-ping-slow',
            )}
          />
          <div
            className={classNames(
              'relative text-4xl',
              getIcon(),
              getIconColor(),
            )}
          />
        </div>

        {/* Main message */}
        <p
          className={classNames(
            'text-base font-semibold',
            getTextColor(),
          )}
        >
          {message || defaultMessage}
        </p>

        {/* Sub message */}
        <p
          className={classNames(
            'text-sm mt-1.5',
            getSubTextColor(),
          )}
        >
          {subMessage || defaultSubMessage}
        </p>

        {/* Size limits info */}
        {!isInvalid && (
          <p className="text-xs text-recoder-elements-textTertiary mt-2 opacity-70">
            Max {formatFileSize(MAX_FILE_SIZE)} per file, {formatFileSize(MAX_TOTAL_SIZE)} total
          </p>
        )}
      </div>
    </div>
  );
});

DragDropOverlay.displayName = 'DragDropOverlay';

/**
 * Minimal drag indicator for compact spaces
 */
export const DragIndicator = memo(({ isDraggingOver }: { isDraggingOver: boolean }) => {
  if (!isDraggingOver) return null;

  return (
    <div
      className={classNames(
        'absolute inset-x-0 top-0 h-1',
        'bg-gradient-to-r from-transparent via-blue-500 to-transparent',
        'animate-shimmer',
      )}
    />
  );
});

DragIndicator.displayName = 'DragIndicator';
