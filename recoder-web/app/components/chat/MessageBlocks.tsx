/**
 * MessageBlocks Component
 *
 * Renders special XML tags from AI messages with appropriate styling.
 * Inspired by December's ChatMessage component.
 *
 * Supported blocks:
 * - ThinkingBlock - AI thinking/reasoning (collapsible, indigo)
 * - ErrorBlock - Error messages (red)
 * - SuccessBlock - Success messages (green)
 * - WarningBlock - Warning messages (yellow)
 * - InfoBlock - Info messages (blue)
 * - CodeBlock - Syntax highlighted code
 * - ConsoleBlock - Terminal output
 * - RouteBlock - Route/URL information
 * - DiffBlock - File changes/diffs
 */

import { memo, useState, useEffect, useMemo } from 'react';
import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
import { bundledLanguages, codeToHtml, isSpecialLang, type BundledLanguage } from 'shiki';
import { classNames } from '~/utils/classNames';
import { CopyButton } from '~/components/ui/CopyButton';
import type { MessageBlock, MessageBlockType, MessageBlockParseResult } from '~/lib/services/action-parser';
import { parseMessageBlocks, hasMessageBlockTags } from '~/lib/services/action-parser';

// ============================================================================
// State Management with nanostores
// ============================================================================

// Track which thinking blocks are collapsed
export const collapsedThinkingBlocks = atom<Set<string>>(new Set());

// Track syntax highlighted code HTML cache
export const codeHighlightCache = atom<Map<string, string>>(new Map());

// Helper to toggle collapse state
export function toggleThinkingBlock(blockId: string): void {
  const current = collapsedThinkingBlocks.get();
  const newSet = new Set(current);
  if (newSet.has(blockId)) {
    newSet.delete(blockId);
  } else {
    newSet.add(blockId);
  }
  collapsedThinkingBlocks.set(newSet);
}

// Helper to check if block is collapsed
export function isBlockCollapsed(blockId: string): boolean {
  return collapsedThinkingBlocks.get().has(blockId);
}

// ============================================================================
// Block Components
// ============================================================================

interface BlockProps {
  block: MessageBlock;
  className?: string;
}

/**
 * ThinkingBlock - AI thinking/reasoning process
 * Collapsible with indigo styling
 */
export const ThinkingBlock = memo(function ThinkingBlock({ block, className }: BlockProps) {
  const collapsedBlocks = useStore(collapsedThinkingBlocks);
  const isCollapsed = collapsedBlocks.has(block.id);

  return (
    <div
      className={classNames(
        'my-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg overflow-hidden',
        className
      )}
    >
      <button
        onClick={() => toggleThinkingBlock(block.id)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-indigo-500/20 border-b border-indigo-500/30 hover:bg-indigo-500/30 transition-colors text-left"
      >
        <div className="i-ph:brain text-indigo-400" />
        <span className="text-sm font-medium text-indigo-400">Thinking Process</span>
        <div
          className={classNames(
            'ml-auto text-indigo-400 transition-transform duration-200',
            isCollapsed ? 'i-ph:caret-down' : 'i-ph:caret-up'
          )}
        />
      </button>
      <div
        className={classNames(
          'transition-all duration-200 overflow-hidden',
          isCollapsed ? 'max-h-0' : 'max-h-[500px]'
        )}
      >
        <div className="p-3 text-sm text-indigo-300 italic whitespace-pre-wrap overflow-auto max-h-[480px]">
          {block.content}
        </div>
      </div>
    </div>
  );
});

/**
 * ErrorBlock - Error messages with red styling
 */
export const ErrorBlock = memo(function ErrorBlock({ block, className }: BlockProps) {
  return (
    <div
      className={classNames(
        'my-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3',
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="i-ph:warning-circle text-red-400" />
        <span className="text-sm font-medium text-red-400">Error</span>
      </div>
      <div className="text-sm text-red-300 whitespace-pre-wrap">{block.content}</div>
    </div>
  );
});

/**
 * SuccessBlock - Success messages with green styling
 */
export const SuccessBlock = memo(function SuccessBlock({ block, className }: BlockProps) {
  return (
    <div
      className={classNames(
        'my-3 bg-green-500/10 border border-green-500/30 rounded-lg p-3',
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="i-ph:check-circle text-green-400" />
        <span className="text-sm font-medium text-green-400">Success</span>
      </div>
      <div className="text-sm text-green-300 whitespace-pre-wrap">{block.content}</div>
    </div>
  );
});

/**
 * WarningBlock - Warning messages with yellow styling
 */
export const WarningBlock = memo(function WarningBlock({ block, className }: BlockProps) {
  return (
    <div
      className={classNames(
        'my-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3',
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="i-ph:warning text-yellow-400" />
        <span className="text-sm font-medium text-yellow-400">Warning</span>
      </div>
      <div className="text-sm text-yellow-300 whitespace-pre-wrap">{block.content}</div>
    </div>
  );
});

/**
 * InfoBlock - Info messages with blue styling
 */
export const InfoBlock = memo(function InfoBlock({ block, className }: BlockProps) {
  return (
    <div
      className={classNames(
        'my-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3',
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="i-ph:info text-blue-400" />
        <span className="text-sm font-medium text-blue-400">Info</span>
      </div>
      <div className="text-sm text-blue-300 whitespace-pre-wrap">{block.content}</div>
    </div>
  );
});

/**
 * CodeBlockMessage - Syntax highlighted code with copy button
 */
export const CodeBlockMessage = memo(function CodeBlockMessage({ block, className }: BlockProps) {
  const [html, setHTML] = useState<string | undefined>(undefined);
  const language = (block.language || 'plaintext') as BundledLanguage;

  // Language display label
  const languageLabel = useMemo(() => {
    const labels: Record<string, string> = {
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      python: 'Python',
      jsx: 'JSX',
      tsx: 'TSX',
      html: 'HTML',
      css: 'CSS',
      json: 'JSON',
      bash: 'Bash',
      shell: 'Shell',
      plaintext: 'Plain Text',
    };
    return labels[language] || language.charAt(0).toUpperCase() + language.slice(1);
  }, [language]);

  useEffect(() => {
    const processCode = async () => {
      // Check cache first
      const cache = codeHighlightCache.get();
      const cacheKey = `${block.id}_${language}`;

      if (cache.has(cacheKey)) {
        setHTML(cache.get(cacheKey));
        return;
      }

      try {
        const highlighted = await codeToHtml(block.content, {
          lang: language,
          theme: 'dark-plus',
        });
        setHTML(highlighted);

        // Update cache
        const newCache = new Map(cache);
        newCache.set(cacheKey, highlighted);
        codeHighlightCache.set(newCache);
      } catch (e) {
        // Fallback to plain text
        setHTML(`<pre><code>${block.content}</code></pre>`);
      }
    };

    processCode();
  }, [block.content, block.id, language]);

  return (
    <div
      className={classNames(
        'my-4 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-2">
          <div className="i-ph:code text-bolt-elements-textSecondary" />
          <span className="text-sm font-medium text-bolt-elements-textSecondary">{languageLabel}</span>
        </div>
        <CopyButton
          text={block.content}
          size="sm"
          variant="ghost"
          showLabel
          label="Copy"
          copiedLabel="Copied!"
        />
      </div>

      {/* Code content */}
      <div className="p-3 overflow-x-auto">
        <div
          className="text-sm [&_pre]:m-0 [&_pre]:bg-transparent [&_code]:text-bolt-elements-textSecondary"
          dangerouslySetInnerHTML={{ __html: html ?? `<pre><code>${(block.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>` }}
        />
      </div>
    </div>
  );
});

/**
 * ConsoleBlock - Terminal output styling
 */
export const ConsoleBlock = memo(function ConsoleBlock({ block, className }: BlockProps) {
  return (
    <div
      className={classNames(
        'my-4 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-bolt-elements-background-depth-3 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-2">
          <div className="i-ph:terminal text-bolt-elements-textSecondary" />
          <span className="text-sm font-medium text-bolt-elements-textSecondary">Console Output</span>
        </div>
        <CopyButton text={block.content} size="sm" variant="ghost" />
      </div>

      {/* Console content */}
      <div className="p-3 overflow-x-auto">
        <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
          <code>{block.content}</code>
        </pre>
      </div>
    </div>
  );
});

/**
 * RouteBlock - Route/URL information
 */
export const RouteBlock = memo(function RouteBlock({ block, className }: BlockProps) {
  return (
    <div
      className={classNames(
        'my-3 bg-orange-500/10 border border-orange-500/30 rounded-lg p-3',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <div className="i-ph:compass text-orange-400" />
        <span className="text-sm font-medium text-orange-400">Current Route</span>
        <code className="ml-auto text-xs text-orange-300 bg-orange-500/20 px-2 py-0.5 rounded">
          {block.content}
        </code>
      </div>
    </div>
  );
});

/**
 * DiffBlock - Show file changes/diffs
 */
export const DiffBlock = memo(function DiffBlock({ block, className }: BlockProps) {
  // Parse and render diff content with appropriate styling
  const formattedDiff = useMemo(() => {
    const lines = block.content.split('\n');
    return lines.map((line, index) => {
      let lineClass = 'text-bolt-elements-textSecondary';
      let bgClass = '';

      if (line.startsWith('+') && !line.startsWith('+++')) {
        lineClass = 'text-green-400';
        bgClass = 'bg-green-500/10';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        lineClass = 'text-red-400';
        bgClass = 'bg-red-500/10';
      } else if (line.startsWith('@@')) {
        lineClass = 'text-cyan-400';
        bgClass = 'bg-cyan-500/10';
      } else if (line.startsWith('diff ') || line.startsWith('index ')) {
        lineClass = 'text-bolt-elements-textTertiary';
      } else if (line.startsWith('+++') || line.startsWith('---')) {
        lineClass = 'text-yellow-400';
      }

      return (
        <div key={index} className={classNames('px-2', bgClass)}>
          <span className={lineClass}>{line || ' '}</span>
        </div>
      );
    });
  }, [block.content]);

  return (
    <div
      className={classNames(
        'my-4 bg-pink-500/10 border border-pink-500/30 rounded-lg overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-pink-500/20 border-b border-pink-500/30">
        <div className="flex items-center gap-2">
          <div className="i-ph:git-branch text-pink-400" />
          <span className="text-sm font-medium text-pink-400">Changes</span>
        </div>
        <CopyButton text={block.content} size="sm" variant="ghost" />
      </div>

      {/* Diff content */}
      <div className="p-3 overflow-x-auto">
        <pre className="text-xs font-mono">
          <code>{formattedDiff}</code>
        </pre>
      </div>
    </div>
  );
});

// ============================================================================
// Block Renderer
// ============================================================================

/**
 * Renders a single MessageBlock based on its type
 */
export const MessageBlockRenderer = memo(function MessageBlockRenderer({
  block,
  className,
}: BlockProps) {
  switch (block.type) {
    case 'thinking':
      return <ThinkingBlock block={block} className={className} />;
    case 'error':
      return <ErrorBlock block={block} className={className} />;
    case 'success':
      return <SuccessBlock block={block} className={className} />;
    case 'warning':
      return <WarningBlock block={block} className={className} />;
    case 'info':
      return <InfoBlock block={block} className={className} />;
    case 'code':
      return <CodeBlockMessage block={block} className={className} />;
    case 'console':
      return <ConsoleBlock block={block} className={className} />;
    case 'route':
      return <RouteBlock block={block} className={className} />;
    case 'diff':
      return <DiffBlock block={block} className={className} />;
    default:
      // Unknown block type - render as info
      return <InfoBlock block={block} className={className} />;
  }
});

// ============================================================================
// Message Content Parser
// ============================================================================

interface ParsedMessageContentProps {
  content: string;
  className?: string;
  renderText?: (text: string, index: number) => React.ReactNode;
}

/**
 * Parses AI message content and renders both text segments and message blocks.
 * Use this component to render assistant messages that may contain special tags.
 */
export const ParsedMessageContent = memo(function ParsedMessageContent({
  content,
  className,
  renderText,
}: ParsedMessageContentProps) {
  const parseResult = useMemo(() => {
    if (!hasMessageBlockTags(content)) {
      return null;
    }
    return parseMessageBlocks(content);
  }, [content]);

  // If no special tags, just return null (let parent handle plain text)
  if (!parseResult || !parseResult.hasBlocks) {
    return null;
  }

  // Build a combined list of elements sorted by position
  const elements: Array<{
    type: 'text' | 'block';
    start: number;
    end: number;
    content: string | MessageBlock;
  }> = [];

  // Add text segments
  for (const segment of parseResult.textSegments) {
    elements.push({
      type: 'text',
      start: segment.start,
      end: segment.end,
      content: segment.text,
    });
  }

  // Add blocks
  for (const block of parseResult.blocks) {
    elements.push({
      type: 'block',
      start: block.index,
      end: block.index + block.raw.length,
      content: block,
    });
  }

  // Sort by position
  elements.sort((a, b) => a.start - b.start);

  return (
    <div className={classNames('space-y-2', className)}>
      {elements.map((element, index) => {
        if (element.type === 'text') {
          // Render text segment
          const text = element.content as string;
          if (renderText) {
            return <div key={`text-${index}`}>{renderText(text, index)}</div>;
          }
          // Default text rendering
          return (
            <div key={`text-${index}`} className="prose prose-sm prose-invert max-w-none">
              {text.split('\n').map((line, i) => (
                <p key={i} className="mb-1">
                  {line}
                </p>
              ))}
            </div>
          );
        } else {
          // Render block
          const block = element.content as MessageBlock;
          return <MessageBlockRenderer key={`block-${block.id}`} block={block} />;
        }
      })}
    </div>
  );
});

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook to parse message content and check for special blocks
 */
export function useMessageBlocks(content: string): MessageBlockParseResult | null {
  return useMemo(() => {
    if (!hasMessageBlockTags(content)) {
      return null;
    }
    return parseMessageBlocks(content);
  }, [content]);
}

/**
 * Hook to check if content has any message blocks
 */
export function useHasMessageBlocks(content: string): boolean {
  return useMemo(() => hasMessageBlockTags(content), [content]);
}

// ============================================================================
// Exports
// ============================================================================

export default ParsedMessageContent;
