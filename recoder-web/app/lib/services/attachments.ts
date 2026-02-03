/**
 * Attachment Service
 * Handles file attachment processing for chat messages
 * Inspired by december's attachment system
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AttachmentService');

// Constants
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
export const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB total
export const MAX_IMAGE_DIMENSION = 2048; // Max dimension for image preview

// Supported file types
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/json',
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'text/css',
  'text/html',
];
export const SUPPORTED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', // Images
  '.pdf', '.txt', '.md', '.docx', // Documents
  '.json', '.js', '.ts', '.jsx', '.tsx', '.css', '.html', // Code files
];

// Types
export type AttachmentType = 'image' | 'document';

export interface ProcessedAttachment {
  id: string;
  type: AttachmentType;
  name: string;
  mimeType: string;
  size: number;
  base64: string;
  previewUrl?: string;
  thumbnailBase64?: string;
  extractedText?: string;
}

export interface AttachmentError {
  file: string;
  error: string;
  code: 'SIZE_EXCEEDED' | 'UNSUPPORTED_TYPE' | 'PROCESSING_ERROR' | 'TOTAL_SIZE_EXCEEDED';
}

export interface ProcessingResult {
  successful: ProcessedAttachment[];
  failed: AttachmentError[];
  totalSize: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: AttachmentError[];
}

/**
 * Generate a unique ID for an attachment
 */
function generateAttachmentId(): string {
  return `attachment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Determine attachment type from MIME type
 */
export function getAttachmentType(mimeType: string): AttachmentType {
  if (SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    return 'image';
  }
  return 'document';
}

/**
 * Check if a file type is supported
 */
export function isFileTypeSupported(file: File): boolean {
  const mimeSupported = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_DOCUMENT_TYPES].includes(file.type);
  if (mimeSupported) return true;

  // Check by extension as fallback
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(extension);
}

/**
 * Validate files before processing
 */
export function validateFiles(files: File[], existingSize: number = 0): ValidationResult {
  const errors: AttachmentError[] = [];
  let totalSize = existingSize;

  for (const file of files) {
    // Check individual file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push({
        file: file.name,
        error: `File exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`,
        code: 'SIZE_EXCEEDED',
      });
      continue;
    }

    // Check file type
    if (!isFileTypeSupported(file)) {
      errors.push({
        file: file.name,
        error: `Unsupported file type: ${file.type || 'unknown'}`,
        code: 'UNSUPPORTED_TYPE',
      });
      continue;
    }

    totalSize += file.size;
  }

  // Check total size
  if (totalSize > MAX_TOTAL_SIZE) {
    errors.push({
      file: 'All files',
      error: `Total size exceeds maximum of ${formatFileSize(MAX_TOTAL_SIZE)}`,
      code: 'TOTAL_SIZE_EXCEEDED',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Convert a File to base64 string
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Generate a thumbnail/preview for an image
 * Resizes large images for preview display
 */
export async function generateImagePreview(
  file: File,
  maxDimension: number = 200
): Promise<{ previewUrl: string; thumbnailBase64: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate dimensions
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height / width) * maxDimension;
          width = maxDimension;
        } else {
          width = (width / height) * maxDimension;
          height = maxDimension;
        }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to base64
      const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      const previewUrl = canvas.toDataURL('image/jpeg', 0.8);

      resolve({ previewUrl, thumbnailBase64 });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Extract text content from a text-based file
 */
export async function extractTextContent(file: File): Promise<string | undefined> {
  const textTypes = [
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'application/json',
    'text/javascript',
    'application/javascript',
    'text/typescript',
    'text/css',
    'text/html',
  ];

  // Check if it's a text file by MIME type
  if (textTypes.includes(file.type)) {
    return await readFileAsText(file);
  }

  // Check by extension for files without proper MIME types
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  const textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.css', '.html'];

  if (textExtensions.includes(extension)) {
    return await readFileAsText(file);
  }

  // PDF text extraction would require a library like pdf.js
  // For now, we'll skip PDF text extraction and just include it as binary
  if (file.type === 'application/pdf') {
    logger.debug('PDF text extraction not implemented, including as binary');
    return undefined;
  }

  // DOCX text extraction would require a library
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    logger.debug('DOCX text extraction not implemented, including as binary');
    return undefined;
  }

  return undefined;
}

/**
 * Read a file as text
 */
async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file as text'));
    reader.readAsText(file);
  });
}

/**
 * Process a single file into a ProcessedAttachment
 */
export async function processFile(file: File): Promise<ProcessedAttachment> {
  const id = generateAttachmentId();
  const type = getAttachmentType(file.type);
  const base64 = await fileToBase64(file);

  const attachment: ProcessedAttachment = {
    id,
    type,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    base64,
  };

  // Generate preview for images
  if (type === 'image') {
    try {
      const { previewUrl, thumbnailBase64 } = await generateImagePreview(file);
      attachment.previewUrl = previewUrl;
      attachment.thumbnailBase64 = thumbnailBase64;
    } catch (error) {
      logger.warn('Failed to generate image preview:', error);
      // Still use the file as-is
      attachment.previewUrl = URL.createObjectURL(file);
    }
  }

  // Extract text from documents
  if (type === 'document') {
    try {
      const text = await extractTextContent(file);
      if (text) {
        attachment.extractedText = text;
      }
    } catch (error) {
      logger.warn('Failed to extract text from document:', error);
    }
  }

  return attachment;
}

/**
 * Process multiple files into ProcessedAttachments
 */
export async function processFiles(
  files: File[],
  existingSize: number = 0
): Promise<ProcessingResult> {
  const successful: ProcessedAttachment[] = [];
  const failed: AttachmentError[] = [];
  let totalSize = existingSize;

  for (const file of files) {
    // Validate individual file
    if (file.size > MAX_FILE_SIZE) {
      failed.push({
        file: file.name,
        error: `File exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`,
        code: 'SIZE_EXCEEDED',
      });
      continue;
    }

    if (!isFileTypeSupported(file)) {
      failed.push({
        file: file.name,
        error: `Unsupported file type: ${file.type || 'unknown'}`,
        code: 'UNSUPPORTED_TYPE',
      });
      continue;
    }

    if (totalSize + file.size > MAX_TOTAL_SIZE) {
      failed.push({
        file: file.name,
        error: `Adding this file would exceed total size limit of ${formatFileSize(MAX_TOTAL_SIZE)}`,
        code: 'TOTAL_SIZE_EXCEEDED',
      });
      continue;
    }

    try {
      const processed = await processFile(file);
      successful.push(processed);
      totalSize += file.size;
    } catch (error) {
      logger.error(`Failed to process file ${file.name}:`, error);
      failed.push({
        file: file.name,
        error: error instanceof Error ? error.message : 'Unknown processing error',
        code: 'PROCESSING_ERROR',
      });
    }
  }

  return { successful, failed, totalSize };
}

/**
 * Format attachment for API transport
 * Returns the attachment in a format suitable for sending to AI models
 */
export function formatAttachmentForAPI(attachment: ProcessedAttachment): {
  type: AttachmentType;
  name: string;
  mimeType: string;
  size: number;
  data: string;
  extractedText?: string;
} {
  return {
    type: attachment.type,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    data: attachment.base64,
    extractedText: attachment.extractedText,
  };
}

/**
 * Format multiple attachments for API transport
 */
export function formatAttachmentsForAPI(attachments: ProcessedAttachment[]): ReturnType<typeof formatAttachmentForAPI>[] {
  return attachments.map(formatAttachmentForAPI);
}

/**
 * Format a file size in bytes to a human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get a summary of attachments for display
 */
export function getAttachmentsSummary(attachments: ProcessedAttachment[]): {
  count: number;
  imageCount: number;
  documentCount: number;
  totalSize: number;
  formattedSize: string;
} {
  const imageCount = attachments.filter(a => a.type === 'image').length;
  const documentCount = attachments.filter(a => a.type === 'document').length;
  const totalSize = attachments.reduce((sum, a) => sum + a.size, 0);

  return {
    count: attachments.length,
    imageCount,
    documentCount,
    totalSize,
    formattedSize: formatFileSize(totalSize),
  };
}

/**
 * Cleanup function to revoke object URLs
 */
export function cleanupAttachment(attachment: ProcessedAttachment): void {
  if (attachment.previewUrl && attachment.previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

/**
 * Cleanup multiple attachments
 */
export function cleanupAttachments(attachments: ProcessedAttachment[]): void {
  attachments.forEach(cleanupAttachment);
}
