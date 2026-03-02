import { memo, useMemo } from 'react';
import { CopyButton } from '~/components/ui/CopyButton';

interface MessageActionsProps {
  content: string;
  role: 'user' | 'assistant';
  onRegenerate?: () => void;
  isStreaming?: boolean;
}

/**
 * Action buttons for chat messages (copy, regenerate, etc.)
 */
export const MessageActions = memo(({ content, role, onRegenerate, isStreaming }: MessageActionsProps) => {
  // Strip HTML tags for plain text copy
  const plainTextContent = useMemo(() => content.replace(/<[^>]*>/g, ''), [content]);

  // Don't show actions while streaming
  if (isStreaming) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      {/* Copy button */}
      <CopyButton
        text={plainTextContent}
        size="sm"
        variant="ghost"
        showLabel
        label="Copy"
        copiedLabel="Copied"
        tooltip="Copy message"
        className="text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary"
      />

      {/* Regenerate button - only for assistant messages */}
      {role === 'assistant' && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-recoder-elements-background-depth-2 text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary transition-colors"
          title="Regenerate response"
        >
          <div className="i-ph:arrows-clockwise text-sm" />
          <span>Regenerate</span>
        </button>
      )}
    </div>
  );
});

MessageActions.displayName = 'MessageActions';
