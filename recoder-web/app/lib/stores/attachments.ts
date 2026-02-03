/**
 * Attachments Store
 * Nanostores-based state management for file attachments
 * Handles pending attachments, upload progress, and previews
 */

import { atom, computed, map } from 'nanostores';
import type { ProcessedAttachment, AttachmentError } from '~/lib/services/attachments';
import {
  processFiles,
  cleanupAttachments,
  formatFileSize,
  MAX_TOTAL_SIZE,
} from '~/lib/services/attachments';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AttachmentsStore');

// Types
export interface UploadProgress {
  attachmentId: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

export interface AttachmentsState {
  /** Currently pending attachments (not yet sent with a message) */
  pending: ProcessedAttachment[];
  /** Upload progress for each attachment */
  progress: Map<string, UploadProgress>;
  /** Recent errors from processing */
  errors: AttachmentError[];
  /** Is currently processing files */
  isProcessing: boolean;
  /** Is drag-drop overlay visible */
  isDraggingOver: boolean;
  /** Total size of pending attachments */
  totalSize: number;
}

// Atoms and Maps
export const pendingAttachments = atom<ProcessedAttachment[]>([]);
export const uploadProgress = map<Record<string, UploadProgress>>({});
export const attachmentErrors = atom<AttachmentError[]>([]);
export const isProcessing = atom<boolean>(false);
export const isDraggingOver = atom<boolean>(false);
export const totalSize = atom<number>(0);

// Computed values
export const attachmentCount = computed(pendingAttachments, (attachments) => attachments.length);

export const hasAttachments = computed(pendingAttachments, (attachments) => attachments.length > 0);

export const imageAttachments = computed(pendingAttachments, (attachments) =>
  attachments.filter((a) => a.type === 'image')
);

export const documentAttachments = computed(pendingAttachments, (attachments) =>
  attachments.filter((a) => a.type === 'document')
);

export const formattedTotalSize = computed(totalSize, (size) => formatFileSize(size));

export const remainingCapacity = computed(totalSize, (size) => MAX_TOTAL_SIZE - size);

export const isAtCapacity = computed(totalSize, (size) => size >= MAX_TOTAL_SIZE);

export const hasErrors = computed(attachmentErrors, (errors) => errors.length > 0);

// Actions

/**
 * Add files to pending attachments
 */
export async function addFiles(files: File[]): Promise<{
  added: number;
  failed: number;
  errors: AttachmentError[];
}> {
  if (files.length === 0) {
    return { added: 0, failed: 0, errors: [] };
  }

  isProcessing.set(true);
  attachmentErrors.set([]);

  try {
    const currentSize = totalSize.get();
    const result = await processFiles(files, currentSize);

    // Add successful attachments
    if (result.successful.length > 0) {
      const current = pendingAttachments.get();
      pendingAttachments.set([...current, ...result.successful]);
      totalSize.set(result.totalSize);

      // Initialize progress for new attachments
      const currentProgress = uploadProgress.get();
      for (const attachment of result.successful) {
        currentProgress[attachment.id] = {
          attachmentId: attachment.id,
          progress: 100,
          status: 'complete',
        };
      }
      uploadProgress.set({ ...currentProgress });

      logger.info(`Added ${result.successful.length} attachment(s)`);
    }

    // Store errors for display
    if (result.failed.length > 0) {
      attachmentErrors.set(result.failed);
      logger.warn(`Failed to process ${result.failed.length} file(s):`, result.failed);
    }

    return {
      added: result.successful.length,
      failed: result.failed.length,
      errors: result.failed,
    };
  } finally {
    isProcessing.set(false);
  }
}

/**
 * Remove a specific attachment by ID
 */
export function removeAttachment(attachmentId: string): void {
  const current = pendingAttachments.get();
  const attachment = current.find((a) => a.id === attachmentId);

  if (attachment) {
    // Cleanup blob URL if exists
    if (attachment.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(attachment.previewUrl);
    }

    // Remove from pending
    pendingAttachments.set(current.filter((a) => a.id !== attachmentId));

    // Update total size
    totalSize.set(totalSize.get() - attachment.size);

    // Remove progress entry
    const currentProgress = uploadProgress.get();
    delete currentProgress[attachmentId];
    uploadProgress.set({ ...currentProgress });

    logger.debug(`Removed attachment: ${attachment.name}`);
  }
}

/**
 * Remove attachment by index
 */
export function removeAttachmentByIndex(index: number): void {
  const current = pendingAttachments.get();
  if (index >= 0 && index < current.length) {
    removeAttachment(current[index].id);
  }
}

/**
 * Clear all pending attachments
 */
export function clearAttachments(): void {
  const current = pendingAttachments.get();
  cleanupAttachments(current);
  pendingAttachments.set([]);
  uploadProgress.set({});
  attachmentErrors.set([]);
  totalSize.set(0);
  logger.debug('Cleared all attachments');
}

/**
 * Clear attachment errors
 */
export function clearErrors(): void {
  attachmentErrors.set([]);
}

/**
 * Set drag-over state for drop zone
 */
export function setDraggingOver(dragging: boolean): void {
  isDraggingOver.set(dragging);
}

/**
 * Get all pending attachments for sending with a message
 * Returns the attachments and clears them from the store
 */
export function consumeAttachments(): ProcessedAttachment[] {
  const current = pendingAttachments.get();
  // Don't cleanup blob URLs here - let the consumer handle it
  pendingAttachments.set([]);
  uploadProgress.set({});
  totalSize.set(0);
  return current;
}

/**
 * Get pending attachments without clearing them
 */
export function getAttachments(): ProcessedAttachment[] {
  return pendingAttachments.get();
}

/**
 * Update upload progress for an attachment
 */
export function updateProgress(attachmentId: string, progress: number, status?: UploadProgress['status'], error?: string): void {
  const currentProgress = uploadProgress.get();
  currentProgress[attachmentId] = {
    attachmentId,
    progress,
    status: status || (progress >= 100 ? 'complete' : 'uploading'),
    error,
  };
  uploadProgress.set({ ...currentProgress });
}

/**
 * Get upload progress for a specific attachment
 */
export function getProgress(attachmentId: string): UploadProgress | undefined {
  return uploadProgress.get()[attachmentId];
}

/**
 * Check if any attachments are still uploading
 */
export const isUploading = computed(uploadProgress, (progress) => {
  return Object.values(progress).some((p) => p.status === 'uploading' || p.status === 'pending');
});

// Store subscription helper for React components
export function subscribeToAttachments(callback: (attachments: readonly ProcessedAttachment[]) => void): () => void {
  return pendingAttachments.subscribe(callback);
}

// Combined state for components that need everything
export const attachmentsState = computed(
  [pendingAttachments, attachmentErrors, isProcessing, isDraggingOver, totalSize],
  (pending, errors, processing, dragging, size) => ({
    pending,
    errors,
    isProcessing: processing,
    isDraggingOver: dragging,
    totalSize: size,
    formattedSize: formatFileSize(size),
    count: pending.length,
    hasAttachments: pending.length > 0,
    hasErrors: errors.length > 0,
  })
);

// Export all stores for direct access
export const stores = {
  pendingAttachments,
  uploadProgress,
  attachmentErrors,
  isProcessing,
  isDraggingOver,
  totalSize,
};
