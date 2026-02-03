import { useRef, useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  pendingAttachments,
  attachmentErrors,
  isProcessing as isProcessingStore,
  isDraggingOver as isDraggingOverStore,
  totalSize as totalSizeStore,
  addFiles,
  removeAttachment as removeAttachmentFromStore,
  removeAttachmentByIndex,
  clearAttachments as clearAttachmentsFromStore,
  clearErrors,
  setDraggingOver,
  consumeAttachments,
  getAttachments,
} from '~/lib/stores/attachments';
import {
  formatAttachmentsForAPI,
  validateFiles,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  type ProcessedAttachment,
  type AttachmentError,
} from '~/lib/services/attachments';

/**
 * Legacy FileAttachment interface for backward compatibility
 */
export interface FileAttachment {
  file: File;
  base64?: string;
  previewUrl?: string;
}

/**
 * Convert ProcessedAttachment to FileAttachment for backward compatibility
 */
function toFileAttachment(processed: ProcessedAttachment): FileAttachment {
  // Create a minimal File object from the processed attachment
  const file = new File(
    [Uint8Array.from(atob(processed.base64), c => c.charCodeAt(0))],
    processed.name,
    { type: processed.mimeType }
  );
  return {
    file,
    base64: processed.base64,
    previewUrl: processed.previewUrl,
  };
}

/**
 * Hook for managing file attachments in chat
 * Supports file input selection, drag-drop, and clipboard paste
 *
 * Uses nanostores for state management and the attachments service for processing
 */
export function useAttachments() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use nanostores for global state
  const processedAttachments = useStore(pendingAttachments);
  const errors = useStore(attachmentErrors);
  const isProcessing = useStore(isProcessingStore);
  const isDraggingOver = useStore(isDraggingOverStore);
  const totalSize = useStore(totalSizeStore);

  // Convert processed attachments to legacy FileAttachment format for backward compatibility
  const attachments: FileAttachment[] = processedAttachments.map(toFileAttachment);

  /**
   * Open file picker dialog
   */
  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Handle file input change (from file picker)
   */
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      await addFiles(files);
      // Clear the input value so the same file can be selected again
      e.target.value = '';
    }
  }, []);

  /**
   * Remove a specific attachment by index
   */
  const removeAttachment = useCallback((index: number) => {
    removeAttachmentByIndex(index);
  }, []);

  /**
   * Handle drag over event
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(true);
  }, []);

  /**
   * Handle drag leave event
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(false);
  }, []);

  /**
   * Handle drop event (drag-drop files)
   */
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      await addFiles(files);
    }
  }, []);

  /**
   * Handle paste event (clipboard images)
   */
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = Array.from(clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault(); // Prevent default paste behavior for images

      const imageFiles: File[] = [];
      // Generate base timestamp once to avoid collisions
      const baseTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

      for (let i = 0; i < imageItems.length; i++) {
        const item = imageItems[i];
        const file = item.getAsFile();
        if (file) {
          // Create a more descriptive filename with timestamp and counter
          const extension = file.type.split('/')[1] || 'png';
          const filename =
            imageItems.length === 1
              ? `pasted-image-${baseTimestamp}.${extension}`
              : `pasted-image-${baseTimestamp}-${i + 1}.${extension}`;

          const newFile = new File([file], filename, {
            type: file.type,
          });
          imageFiles.push(newFile);
        }
      }

      if (imageFiles.length > 0) {
        await addFiles(imageFiles);
        console.log(`Pasted ${imageFiles.length} image(s) from clipboard`);
      }
    }
  }, []);

  /**
   * Clear all attachments
   */
  const clearAttachments = useCallback(() => {
    clearAttachmentsFromStore();
  }, []);

  /**
   * Add attachments programmatically
   */
  const addAttachments = useCallback(async (files: File[]) => {
    await addFiles(files);
  }, []);

  /**
   * Get attachments formatted for AI API (with base64 data)
   * Backward compatible format
   */
  const getAttachmentsForAPI = useCallback(() => {
    return processedAttachments.map((attachment) => ({
      name: attachment.name,
      type: attachment.mimeType,
      size: attachment.size,
      base64: attachment.base64,
    }));
  }, [processedAttachments]);

  /**
   * Get attachments in the new format for API transport
   */
  const getFormattedAttachments = useCallback(() => {
    return formatAttachmentsForAPI(processedAttachments);
  }, [processedAttachments]);

  /**
   * Validate files before adding
   */
  const validateFilesBeforeAdd = useCallback((files: File[]) => {
    return validateFiles(files, totalSize);
  }, [totalSize]);

  /**
   * Get attachment errors
   */
  const getErrors = useCallback(() => {
    return errors;
  }, [errors]);

  /**
   * Clear attachment errors
   */
  const clearAttachmentErrors = useCallback(() => {
    clearErrors();
  }, []);

  return {
    // Backward compatible interface
    attachments,
    fileInputRef,
    isDraggingOver,
    handleAttachmentClick,
    handleFileChange,
    removeAttachment,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    clearAttachments,
    addAttachments,
    getAttachmentsForAPI,
    // New enhanced interface
    processedAttachments,
    isProcessing,
    totalSize,
    errors,
    getFormattedAttachments,
    validateFilesBeforeAdd,
    getErrors,
    clearAttachmentErrors,
    // Constants
    maxFileSize: MAX_FILE_SIZE,
    maxTotalSize: MAX_TOTAL_SIZE,
  };
}

// Re-export types
export type { ProcessedAttachment, AttachmentError };
