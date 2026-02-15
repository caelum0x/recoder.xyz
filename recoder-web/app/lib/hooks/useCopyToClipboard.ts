import { useState, useRef, useEffect, useCallback } from 'react';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('CopyToClipboard');

export interface CopyOptions {
  /** Time in ms before copied state resets (default: 2000) */
  resetTimeout?: number;
  /** Whether to strip HTML tags when copying (default: false) */
  stripHtml?: boolean;
}

export interface UseCopyToClipboardReturn {
  /** Copy text to clipboard, returns success boolean */
  copy: (text: string) => Promise<boolean>;
  /** Copy HTML content to clipboard with fallback to plain text */
  copyHtml: (html: string, plainTextFallback?: string) => Promise<boolean>;
  /** Copy an image blob to clipboard */
  copyImage: (blob: Blob) => Promise<boolean>;
  /** Whether content was recently copied (resets after timeout) */
  copied: boolean;
  /** Any error that occurred during copy */
  error: Error | null;
  /** Reset copied state manually */
  reset: () => void;
}

/**
 * Hook for copying content to clipboard with visual feedback.
 * Supports text, HTML, and image content types.
 *
 * @example
 * ```tsx
 * const { copy, copied, error } = useCopyToClipboard();
 *
 * return (
 *   <button onClick={() => copy('Hello World')}>
 *     {copied ? 'Copied!' : 'Copy'}
 *   </button>
 * );
 * ```
 */
export function useCopyToClipboard(options: CopyOptions = {}): UseCopyToClipboardReturn {
  const { resetTimeout = 2000, stripHtml = false } = options;

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const startResetTimer = useCallback(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, resetTimeout);
  }, [resetTimeout]);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setCopied(false);
    setError(null);
  }, []);

  /**
   * Copy plain text to clipboard
   */
  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      setError(null);

      let textToCopy = text;
      if (stripHtml) {
        textToCopy = text.replace(/<[^>]*>/g, '');
      }

      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      startResetTimer();
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to copy to clipboard');
      logger.error('Failed to copy:', error);
      setError(error);
      return false;
    }
  }, [stripHtml, startResetTimer]);

  /**
   * Copy HTML content with plain text fallback
   */
  const copyHtml = useCallback(async (html: string, plainTextFallback?: string): Promise<boolean> => {
    try {
      setError(null);

      // Try to use ClipboardItem API for rich content
      if (typeof ClipboardItem !== 'undefined') {
        const items: Record<string, Blob> = {
          'text/html': new Blob([html], { type: 'text/html' }),
        };

        // Add plain text fallback
        const plainText = plainTextFallback || html.replace(/<[^>]*>/g, '');
        items['text/plain'] = new Blob([plainText], { type: 'text/plain' });

        await navigator.clipboard.write([new ClipboardItem(items)]);
      } else {
        // Fallback to plain text
        const plainText = plainTextFallback || html.replace(/<[^>]*>/g, '');
        await navigator.clipboard.writeText(plainText);
      }

      setCopied(true);
      startResetTimer();
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to copy HTML to clipboard');
      logger.error('Failed to copy HTML:', error);
      setError(error);

      // Try plain text fallback on error
      try {
        const plainText = plainTextFallback || html.replace(/<[^>]*>/g, '');
        await navigator.clipboard.writeText(plainText);
        setCopied(true);
        startResetTimer();
        return true;
      } catch {
        return false;
      }
    }
  }, [startResetTimer]);

  /**
   * Copy image blob to clipboard
   */
  const copyImage = useCallback(async (blob: Blob): Promise<boolean> => {
    try {
      setError(null);

      if (typeof ClipboardItem === 'undefined') {
        throw new Error('ClipboardItem API not supported');
      }

      // Ensure blob is a supported image type
      const supportedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      if (!supportedTypes.includes(blob.type)) {
        throw new Error(`Unsupported image type: ${blob.type}`);
      }

      // For PNG, we can copy directly. For others, may need conversion
      let imageBlob = blob;
      if (blob.type !== 'image/png') {
        // Convert to PNG for better clipboard compatibility
        imageBlob = await convertToPng(blob);
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': imageBlob,
        }),
      ]);

      setCopied(true);
      startResetTimer();
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to copy image to clipboard');
      logger.error('Failed to copy image:', error);
      setError(error);
      return false;
    }
  }, [startResetTimer]);

  return {
    copy,
    copyHtml,
    copyImage,
    copied,
    error,
    reset,
  };
}

/**
 * Convert image blob to PNG format for clipboard compatibility
 */
async function convertToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);

      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(url);
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error('Failed to convert image to PNG'));
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export default useCopyToClipboard;
