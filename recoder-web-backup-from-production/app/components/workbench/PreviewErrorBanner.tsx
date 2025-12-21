import { memo, useState } from 'react';

interface PreviewErrorBannerProps {
  error: string;
  onDismiss: () => void;
  onAIFix?: () => void;
  isStreaming?: boolean;
}

export const PreviewErrorBanner = memo(({ error, onDismiss, onAIFix, isStreaming }: PreviewErrorBannerProps) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const getTruncatedError = () => {
    const firstLine = error.split('\n')[0];
    const snippet = error.substring(0, 200);
    return firstLine.length < snippet.length ? firstLine : snippet + (snippet.length === 200 ? '...' : '');
  };

  return (
    <div className="absolute top-2 left-2 right-2 z-10 bg-red-950 border border-red-800 rounded-md shadow-lg p-3">
      {/* Close button */}
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 hover:bg-red-900 rounded text-red-400 hover:text-red-300"
      >
        <div className="i-ph:x text-sm" />
      </button>

      {/* Error message */}
      <div className="pr-8">
        <div
          className="text-red-300 font-mono text-xs whitespace-pre-wrap break-words cursor-pointer flex gap-1 items-start"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className={`i-ph:caret-right text-sm mt-0.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
          {isCollapsed ? getTruncatedError() : error}
        </div>
      </div>

      {/* Tip */}
      <div className="mt-2 p-2 bg-red-900/50 rounded text-xs text-red-200 flex items-start gap-2">
        <div className="i-ph:lightbulb text-sm mt-0.5" />
        <span>
          <strong>Tip:</strong> Check if restarting the app fixes the error, or use AI to help debug.
        </span>
      </div>

      {/* Actions */}
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={() => navigator.clipboard.writeText(error)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-red-300 hover:text-red-200 hover:bg-red-900 rounded"
        >
          <div className="i-ph:copy text-sm" />
          Copy
        </button>
        {onAIFix && (
          <button
            onClick={onAIFix}
            disabled={isStreaming}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="i-ph:sparkle text-sm" />
            Fix with AI
          </button>
        )}
      </div>
    </div>
  );
});
