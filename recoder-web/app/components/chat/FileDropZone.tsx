/**
 * FileDropZone Component
 * A reusable drag-and-drop zone for file attachments
 * Inspired by december's ChatInput component
 *
 * Features:
 * - Visual drag-and-drop overlay when dragging files
 * - "Drop files here" message with icon
 * - Border animation on hover
 * - Visual feedback states (idle, hovering, invalid, accepted)
 * - File type and size validation
 */

import { memo, useCallback, useState, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import {
  isDraggingOver as isDraggingOverStore,
  setDraggingOver,
  addFiles,
  totalSize as totalSizeStore,
} from '~/lib/stores/attachments';
import {
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  isFileTypeSupported,
  formatFileSize,
  SUPPORTED_EXTENSIONS,
} from '~/lib/services/attachments';
import { toast } from 'react-hot-toast';

export type DropZoneState = 'idle' | 'hovering' | 'invalid' | 'accepted';

interface FileDropZoneProps {
  children: ReactNode;
  className?: string;
  /** Whether the drop zone is disabled */
  disabled?: boolean;
  /** Callback when files are dropped */
  onFilesDropped?: (files: File[]) => void;
  /** Callback when drop zone state changes */
  onStateChange?: (state: DropZoneState) => void;
  /** Custom accepted file types (defaults to all supported types) */
  acceptedTypes?: string[];
  /** Custom max file size in bytes (defaults to MAX_FILE_SIZE) */
  maxFileSize?: number;
  /** Custom max total size in bytes (defaults to MAX_TOTAL_SIZE) */
  maxTotalSize?: number;
  /** Whether to show the overlay when dragging */
  showOverlay?: boolean;
  /** Custom overlay content */
  overlayContent?: ReactNode;
}

/**
 * FileDropZone - Reusable drag-and-drop file attachment zone
 */
export const FileDropZone = memo(({
  children,
  className,
  disabled = false,
  onFilesDropped,
  onStateChange,
  acceptedTypes,
  maxFileSize = MAX_FILE_SIZE,
  maxTotalSize = MAX_TOTAL_SIZE,
  showOverlay = true,
  overlayContent,
}: FileDropZoneProps) => {
  const isDraggingOver = useStore(isDraggingOverStore);
  const totalSize = useStore(totalSizeStore);
  const [dropState, setDropState] = useState<DropZoneState>('idle');
  const [dragCounter, setDragCounter] = useState(0);

  /**
   * Validate files being dragged
   */
  const validateDraggedFiles = useCallback((dataTransfer: DataTransfer): DropZoneState => {
    const items = Array.from(dataTransfer.items);
    let hasValidFiles = false;
    let hasInvalidFiles = false;

    for (const item of items) {
      if (item.kind !== 'file') continue;

      const type = item.type;
      const isTypeValid = acceptedTypes
        ? acceptedTypes.some(accepted => type.match(accepted))
        : isFileTypeSupported({ type, name: '', size: 0 } as File);

      if (isTypeValid) {
        hasValidFiles = true;
      } else {
        hasInvalidFiles = true;
      }
    }

    if (hasInvalidFiles && !hasValidFiles) {
      return 'invalid';
    }
    return hasValidFiles ? 'hovering' : 'idle';
  }, [acceptedTypes]);

  /**
   * Handle drag enter event
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    setDragCounter(prev => prev + 1);

    if (!isDraggingOver) {
      setDraggingOver(true);
    }

    // Validate files being dragged
    const state = validateDraggedFiles(e.dataTransfer);
    setDropState(state);
    onStateChange?.(state);
  }, [disabled, isDraggingOver, validateDraggedFiles, onStateChange]);

  /**
   * Handle drag over event
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    // Set the drop effect based on validation
    const state = validateDraggedFiles(e.dataTransfer);
    e.dataTransfer.dropEffect = state === 'invalid' ? 'none' : 'copy';
  }, [disabled, validateDraggedFiles]);

  /**
   * Handle drag leave event
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter(prev => {
      const newCounter = prev - 1;
      if (newCounter <= 0) {
        setDraggingOver(false);
        setDropState('idle');
        onStateChange?.('idle');
        return 0;
      }
      return newCounter;
    });
  }, [onStateChange]);

  /**
   * Handle drop event
   */
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter(0);
    setDraggingOver(false);

    if (disabled) {
      setDropState('idle');
      onStateChange?.('idle');
      return;
    }

    const files = Array.from(e.dataTransfer.files);

    if (files.length === 0) {
      setDropState('idle');
      onStateChange?.('idle');
      return;
    }

    // Validate files
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      // Check file type
      const isTypeValid = acceptedTypes
        ? acceptedTypes.some(accepted => file.type.match(accepted) || file.name.match(accepted))
        : isFileTypeSupported(file);

      if (!isTypeValid) {
        errors.push(`${file.name}: Unsupported file type`);
        continue;
      }

      // Check file size
      if (file.size > maxFileSize) {
        errors.push(`${file.name}: Exceeds max size of ${formatFileSize(maxFileSize)}`);
        continue;
      }

      // Check total size
      if (totalSize + file.size > maxTotalSize) {
        errors.push(`${file.name}: Would exceed total size limit of ${formatFileSize(maxTotalSize)}`);
        continue;
      }

      validFiles.push(file);
    }

    // Show errors
    if (errors.length > 0) {
      if (errors.length === 1) {
        toast.error(errors[0]);
      } else {
        toast.error(`${errors.length} files could not be added`);
        console.warn('File validation errors:', errors);
      }
    }

    // Add valid files
    if (validFiles.length > 0) {
      await addFiles(validFiles);
      onFilesDropped?.(validFiles);
      setDropState('accepted');
      onStateChange?.('accepted');

      // Show success toast
      if (validFiles.length === files.length) {
        toast.success(`${validFiles.length} file${validFiles.length > 1 ? 's' : ''} added`);
      } else {
        toast.success(`${validFiles.length} of ${files.length} files added`);
      }

      // Reset state after brief delay
      setTimeout(() => {
        setDropState('idle');
        onStateChange?.('idle');
      }, 500);
    } else {
      setDropState('idle');
      onStateChange?.('idle');
    }
  }, [disabled, acceptedTypes, maxFileSize, maxTotalSize, totalSize, onFilesDropped, onStateChange]);

  return (
    <div
      className={classNames(
        'relative',
        className,
        // Border animation states
        isDraggingOver && dropState === 'hovering' && 'ring-2 ring-blue-500 border-blue-500',
        isDraggingOver && dropState === 'invalid' && 'ring-2 ring-red-500 border-red-500',
        dropState === 'accepted' && 'ring-2 ring-green-500 border-green-500',
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {/* Overlay */}
      {showOverlay && isDraggingOver && (
        <FileDropOverlay
          state={dropState}
          customContent={overlayContent}
        />
      )}
    </div>
  );
});

FileDropZone.displayName = 'FileDropZone';

/**
 * File drop overlay component
 */
interface FileDropOverlayProps {
  state: DropZoneState;
  customContent?: ReactNode;
}

const FileDropOverlay = memo(({ state, customContent }: FileDropOverlayProps) => {
  if (customContent) {
    return (
      <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
        {customContent}
      </div>
    );
  }

  const isInvalid = state === 'invalid';

  return (
    <div
      className={classNames(
        'absolute inset-0 z-50 pointer-events-none',
        'flex items-center justify-center',
        'transition-all duration-200',
        isInvalid
          ? 'bg-red-500/10 dark:bg-red-400/10'
          : 'bg-blue-500/10 dark:bg-blue-400/10',
      )}
    >
      <div
        className={classNames(
          'bg-bolt-elements-background-depth-1 px-8 py-6 rounded-xl shadow-2xl',
          'border-2 border-dashed',
          'text-center transform transition-all duration-200',
          'animate-pulse-subtle',
          isInvalid
            ? 'border-red-500 dark:border-red-400'
            : 'border-blue-500 dark:border-blue-400',
        )}
      >
        <div
          className={classNames(
            'text-4xl mx-auto mb-3',
            isInvalid
              ? 'i-ph:x-circle text-red-500 dark:text-red-400'
              : 'i-ph:upload-simple text-blue-500 dark:text-blue-400',
          )}
        />
        <p
          className={classNames(
            'text-base font-semibold',
            isInvalid
              ? 'text-red-600 dark:text-red-400'
              : 'text-bolt-elements-textPrimary',
          )}
        >
          {isInvalid ? 'Unsupported file type' : 'Drop files here'}
        </p>
        <p
          className={classNames(
            'text-sm mt-1.5',
            isInvalid
              ? 'text-red-500/70 dark:text-red-400/70'
              : 'text-bolt-elements-textSecondary',
          )}
        >
          {isInvalid ? (
            'Images and documents only'
          ) : (
            <>
              <span className="block">Images, PDFs, and code files</span>
              <span className="text-xs opacity-70">Max {formatFileSize(MAX_FILE_SIZE)} per file, {formatFileSize(MAX_TOTAL_SIZE)} total</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
});

FileDropOverlay.displayName = 'FileDropOverlay';

/**
 * Compact inline drop hint shown at the bottom of chat input
 */
export const DropHint = memo(() => (
  <div className="text-xs text-bolt-elements-textTertiary text-right">
    <div>Drag & drop files anywhere</div>
    <div className="opacity-70">Max {formatFileSize(MAX_FILE_SIZE)} per file, {formatFileSize(MAX_TOTAL_SIZE)} total</div>
  </div>
));

DropHint.displayName = 'DropHint';

/**
 * File type icons based on MIME type
 */
export const getFileTypeIcon = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) {
    return 'i-ph:image text-emerald-400';
  }
  if (mimeType === 'application/pdf') {
    return 'i-ph:file-pdf text-red-400';
  }
  if (mimeType.includes('javascript') || mimeType.includes('typescript')) {
    return 'i-ph:file-js text-yellow-400';
  }
  if (mimeType.includes('json')) {
    return 'i-ph:brackets-curly text-orange-400';
  }
  if (mimeType.includes('css')) {
    return 'i-ph:file-css text-blue-400';
  }
  if (mimeType.includes('html')) {
    return 'i-ph:file-html text-orange-500';
  }
  if (mimeType.includes('markdown') || mimeType === 'text/x-markdown') {
    return 'i-ph:markdown-logo text-bolt-elements-textTertiary';
  }
  if (mimeType === 'text/plain') {
    return 'i-ph:file-text text-bolt-elements-textTertiary';
  }
  return 'i-ph:file text-blue-400';
};

export default FileDropZone;
