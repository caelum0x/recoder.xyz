/**
 * Clone URL Modal - Clone any website with one click
 */

import { useState, useCallback } from 'react';
import { Dialog, DialogRoot, DialogTitle, DialogDescription } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';

interface CloneUrlModalProps {
  open: boolean;
  onClose: () => void;
  onCloneComplete: (data: { files: Record<string, string>; prompt: string; title: string }) => void;
}

export function CloneUrlModal({ open, onClose, onCloneComplete }: CloneUrlModalProps) {
  const [url, setUrl] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const handleClone = useCallback(async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setIsCloning(true);
    setError(null);
    setProgress('Analyzing website...');

    try {
      const response = await fetch('/api/clone-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json() as {
        success?: boolean;
        error?: string;
        files?: Record<string, string>;
        prompt?: string;
        title?: string;
        fileCount?: number;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to clone website');
      }

      setProgress(`Cloned ${data.fileCount || Object.keys(data.files || {}).length} files!`);

      // Small delay to show success message
      setTimeout(() => {
        onCloneComplete({
          files: data.files || {},
          prompt: data.prompt || '',
          title: data.title || 'Cloned Website',
        });
        handleClose();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone website');
      setProgress(null);
    } finally {
      setIsCloning(false);
    }
  }, [url, onCloneComplete]);

  const handleClose = useCallback(() => {
    if (!isCloning) {
      setUrl('');
      setError(null);
      setProgress(null);
      onClose();
    }
  }, [isCloning, onClose]);

  return (
    <DialogRoot open={open}>
      <Dialog onClose={handleClose}>
        <div className="flex items-center justify-between mb-4">
          <DialogTitle>Clone Website</DialogTitle>
        </div>

        <DialogDescription className="mb-4">
          Enter a URL to create an exact clone of any website. This will download HTML, CSS, images, and create a working project.
        </DialogDescription>

        <div className="space-y-4">
          {/* URL Input */}
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
              Website URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://example.com"
              disabled={isCloning}
              className={classNames(
                'w-full px-3 py-2 rounded-lg text-bolt-elements-textPrimary',
                'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                'focus:ring-2 focus:ring-bolt-elements-focus focus:border-transparent',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'placeholder:text-bolt-elements-textTertiary'
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCloning) {
                  handleClone();
                }
              }}
              autoFocus
            />
          </div>

          {/* Progress Message */}
          {progress && (
            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-600 text-sm">
              {isCloning && <div className="i-ph:spinner animate-spin" />}
              {!isCloning && <div className="i-ph:check-circle" />}
              {progress}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Example URLs */}
          <div className="text-xs text-bolt-elements-textTertiary">
            <span className="font-medium">Examples:</span> Landing pages, portfolios, marketing sites.
            <br />
            Note: Some sites may block cloning or have dynamic content that won't work.
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={handleClose}
            disabled={isCloning}
            className={classNames(
              'px-4 py-2 rounded-lg transition-colors',
              'bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover',
              'text-bolt-elements-button-secondary-text',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleClone}
            disabled={isCloning || !url.trim()}
            className={classNames(
              'px-4 py-2 rounded-lg transition-colors flex items-center gap-2',
              'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700',
              'text-white font-medium',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isCloning ? (
              <>
                <div className="i-ph:spinner animate-spin" />
                Cloning...
              </>
            ) : (
              <>
                <div className="i-ph:globe" />
                Clone Website
              </>
            )}
          </button>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
