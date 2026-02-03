/**
 * FileAttachment - Attach files to chat messages
 *
 * Features:
 * - Drag and drop file upload
 * - Paste from clipboard
 * - Image preview with thumbnails
 * - File type detection
 * - Size limits and validation
 * - Multiple file support
 * - Upload progress
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { atom, map } from 'nanostores';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';

// Types
export interface AttachmentFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
  base64?: string;
  status: 'pending' | 'uploading' | 'ready' | 'error';
  progress: number;
  error?: string;
}

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES = 10;

const ALLOWED_TYPES = {
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
  document: ['application/pdf', 'text/plain', 'text/markdown', 'application/json'],
  code: [
    'text/javascript',
    'text/typescript',
    'text/html',
    'text/css',
    'text/x-python',
    'application/x-typescript',
  ],
};

const ALL_ALLOWED_TYPES = [
  ...ALLOWED_TYPES.image,
  ...ALLOWED_TYPES.document,
  ...ALLOWED_TYPES.code,
];

// File type icons
const FILE_ICONS: Record<string, string> = {
  'image/png': 'i-ph:file-image',
  'image/jpeg': 'i-ph:file-image',
  'image/gif': 'i-ph:file-image',
  'image/webp': 'i-ph:file-image',
  'image/svg+xml': 'i-ph:file-svg',
  'application/pdf': 'i-ph:file-pdf',
  'text/plain': 'i-ph:file-text',
  'text/markdown': 'i-ph:file-text',
  'application/json': 'i-ph:file-code',
  'text/javascript': 'i-ph:file-js',
  'text/typescript': 'i-ph:file-ts',
  'text/html': 'i-ph:file-html',
  'text/css': 'i-ph:file-css',
  default: 'i-ph:file',
};

// Attachment store
export const attachmentStore = map<{
  attachments: AttachmentFile[];
  isDragging: boolean;
  totalSize: number;
}>({
  attachments: [],
  isDragging: false,
  totalSize: 0,
});

// Helper functions
function generateId(): string {
  return `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string): string {
  return FILE_ICONS[type] || FILE_ICONS.default;
}

function isImageType(type: string): boolean {
  return ALLOWED_TYPES.image.includes(type);
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Remove data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Attachment actions
export const attachmentActions = {
  addFiles: async (files: FileList | File[]): Promise<void> => {
    const current = attachmentStore.get();
    const fileArray = Array.from(files);

    // Check file count limit
    if (current.attachments.length + fileArray.length > MAX_FILES) {
      console.warn(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    for (const file of fileArray) {
      // Validate file type
      if (!ALL_ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(ts|tsx|js|jsx|py|md|txt|json)$/i)) {
        console.warn(`File type not supported: ${file.type}`);
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        console.warn(`File too large: ${file.name} (${formatFileSize(file.size)})`);
        continue;
      }

      // Check total size limit
      if (current.totalSize + file.size > MAX_TOTAL_SIZE) {
        console.warn('Total attachment size limit exceeded');
        break;
      }

      const attachment: AttachmentFile = {
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        status: 'pending',
        progress: 0,
      };

      // Generate preview for images
      if (isImageType(file.type)) {
        attachment.preview = URL.createObjectURL(file);
      }

      // Convert to base64 for AI
      try {
        attachment.base64 = await fileToBase64(file);
        attachment.status = 'ready';
        attachment.progress = 100;
      } catch (e) {
        attachment.status = 'error';
        attachment.error = 'Failed to process file';
      }

      attachmentStore.setKey('attachments', [...attachmentStore.get().attachments, attachment]);
      attachmentStore.setKey('totalSize', attachmentStore.get().totalSize + file.size);
    }
  },

  removeAttachment: (id: string): void => {
    const current = attachmentStore.get();
    const attachment = current.attachments.find((a) => a.id === id);

    if (attachment) {
      // Revoke preview URL
      if (attachment.preview) {
        URL.revokeObjectURL(attachment.preview);
      }

      attachmentStore.setKey(
        'attachments',
        current.attachments.filter((a) => a.id !== id)
      );
      attachmentStore.setKey('totalSize', current.totalSize - attachment.size);
    }
  },

  clearAttachments: (): void => {
    const current = attachmentStore.get();

    // Revoke all preview URLs
    for (const attachment of current.attachments) {
      if (attachment.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
    }

    attachmentStore.set({
      attachments: [],
      isDragging: false,
      totalSize: 0,
    });
  },

  setDragging: (isDragging: boolean): void => {
    attachmentStore.setKey('isDragging', isDragging);
  },
};

// File attachment item component
interface AttachmentItemProps {
  attachment: AttachmentFile;
  onRemove: (id: string) => void;
  compact?: boolean;
}

export const AttachmentItem = memo(function AttachmentItem({
  attachment,
  onRemove,
  compact = false,
}: AttachmentItemProps) {
  const isImage = isImageType(attachment.type);

  return (
    <div
      className={classNames(
        'relative flex items-center gap-2 rounded-lg border transition-colors',
        'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor',
        'hover:border-bolt-elements-borderColorActive group',
        compact ? 'px-2 py-1' : 'px-3 py-2'
      )}
    >
      {/* Preview or icon */}
      {isImage && attachment.preview ? (
        <div className="relative">
          <img
            src={attachment.preview}
            alt={attachment.name}
            className={classNames('rounded object-cover', compact ? 'w-6 h-6' : 'w-10 h-10')}
          />
          {/* Hover preview */}
          <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50">
            <img
              src={attachment.preview}
              alt={attachment.name}
              className="max-w-[200px] max-h-[200px] object-contain rounded-lg shadow-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1"
            />
          </div>
        </div>
      ) : (
        <div
          className={classNames(
            getFileIcon(attachment.type),
            'text-bolt-elements-textSecondary',
            compact ? 'text-base' : 'text-xl'
          )}
        />
      )}

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div
          className={classNames(
            'truncate text-bolt-elements-textPrimary',
            compact ? 'text-xs' : 'text-sm'
          )}
          title={attachment.name}
        >
          {attachment.name}
        </div>
        {!compact && (
          <div className="text-xs text-bolt-elements-textTertiary">
            {formatFileSize(attachment.size)}
          </div>
        )}
      </div>

      {/* Status indicator */}
      {attachment.status === 'uploading' && (
        <div className="w-4 h-4">
          <div className="i-svg-spinners:ring-resize text-blue-500" />
        </div>
      )}
      {attachment.status === 'error' && (
        <div className="i-ph:warning-circle text-red-500" title={attachment.error} />
      )}

      {/* Remove button */}
      <button
        onClick={() => onRemove(attachment.id)}
        className={classNames(
          'p-1 rounded-full transition-colors',
          'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary',
          'hover:bg-bolt-elements-background-depth-3',
          'opacity-0 group-hover:opacity-100'
        )}
        title="Remove attachment"
      >
        <div className="i-ph:x text-sm" />
      </button>
    </div>
  );
});

// Attachments list component
interface AttachmentsListProps {
  className?: string;
  compact?: boolean;
}

export const AttachmentsList = memo(function AttachmentsList({
  className,
  compact = false,
}: AttachmentsListProps) {
  const state = useStore(attachmentStore);

  if (state.attachments.length === 0) return null;

  return (
    <div className={classNames('flex flex-wrap gap-2', className)}>
      {state.attachments.map((attachment) => (
        <AttachmentItem
          key={attachment.id}
          attachment={attachment}
          onRemove={attachmentActions.removeAttachment}
          compact={compact}
        />
      ))}

      {/* Total size indicator */}
      {state.attachments.length > 1 && !compact && (
        <div className="flex items-center text-xs text-bolt-elements-textTertiary">
          <div className="i-ph:files mr-1" />
          {state.attachments.length} files ({formatFileSize(state.totalSize)})
        </div>
      )}
    </div>
  );
});

// Drag and drop zone component
interface DropZoneProps {
  onDrop: (files: FileList) => void;
  className?: string;
  children?: React.ReactNode;
}

export const DropZone = memo(function DropZone({ onDrop, className, children }: DropZoneProps) {
  const state = useStore(attachmentStore);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    attachmentActions.setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    attachmentActions.setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      attachmentActions.setDragging(false);

      if (e.dataTransfer.files.length > 0) {
        onDrop(e.dataTransfer.files);
      }
    },
    [onDrop]
  );

  return (
    <div
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={classNames(
        'relative transition-all duration-200',
        state.isDragging && 'ring-2 ring-blue-500 ring-inset',
        className
      )}
    >
      {children}

      {/* Drag overlay */}
      {state.isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm rounded-lg z-10">
          <div className="flex flex-col items-center gap-2 text-blue-400">
            <div className="i-ph:upload-simple text-4xl" />
            <span className="text-sm font-medium">Drop files here</span>
          </div>
        </div>
      )}
    </div>
  );
});

// File input button component
interface FileInputButtonProps {
  onSelect: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const FileInputButton = memo(function FileInputButton({
  onSelect,
  accept = 'image/*,.pdf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.css,.html,.py',
  multiple = true,
  className,
  children,
}: FileInputButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onSelect(e.target.files);
        e.target.value = ''; // Reset input
      }
    },
    [onSelect]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <button
        onClick={handleClick}
        className={classNames(
          'flex items-center gap-1 transition-colors',
          'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
          className
        )}
        title="Attach files"
      >
        {children || (
          <>
            <div className="i-ph:paperclip text-lg" />
            <span className="text-sm">Attach</span>
          </>
        )}
      </button>
    </>
  );
});

// Main file attachment component
interface FileAttachmentProps {
  className?: string;
  compact?: boolean;
}

export const FileAttachment = memo(function FileAttachment({
  className,
  compact = false,
}: FileAttachmentProps) {
  const state = useStore(attachmentStore);

  const handleFiles = useCallback((files: FileList | File[]) => {
    attachmentActions.addFiles(files);
  }, []);

  // Handle paste
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        handleFiles(files);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handleFiles]);

  return (
    <div className={classNames('space-y-2', className)}>
      {/* File input and drop zone */}
      <DropZone onDrop={handleFiles} className="w-full">
        <div className="flex items-center gap-2">
          <FileInputButton onSelect={handleFiles}>
            <div className="i-ph:paperclip text-lg" />
          </FileInputButton>

          {state.attachments.length > 0 && !compact && (
            <button
              onClick={attachmentActions.clearAttachments}
              className="text-xs text-bolt-elements-textTertiary hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </DropZone>

      {/* Attachments list */}
      <AttachmentsList compact={compact} />
    </div>
  );
});

// Hook for using attachments
export function useFileAttachments() {
  const state = useStore(attachmentStore);

  return {
    attachments: state.attachments,
    isDragging: state.isDragging,
    totalSize: state.totalSize,
    hasAttachments: state.attachments.length > 0,
    addFiles: attachmentActions.addFiles,
    removeAttachment: attachmentActions.removeAttachment,
    clearAttachments: attachmentActions.clearAttachments,
    setDragging: attachmentActions.setDragging,
  };
}

export default FileAttachment;
