'use client';

import { useState, useMemo, Fragment } from 'react';
import classNames from 'classnames';
import { ChevronRightIcon, ChevronDownIcon, SpinnerIcon, SparklesIcon } from './icons';
import type { Generation } from './types';

// Markdown rendering component (simplified)
function MarkdownContent({ content }: { content: string }) {
  // Simple markdown rendering - in production, use a proper markdown library
  const html = useMemo(() => {
    return content
      // Code blocks
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-bolt-elements-background-depth-2 p-3 rounded-lg my-2 overflow-x-auto"><code>$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="bg-bolt-elements-background-depth-2 px-1 rounded text-accent-400">$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-accent-400 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
      // Line breaks
      .replace(/\n/g, '<br />');
  }, [content]);

  return (
    <div
      className="text-sm text-bolt-elements-textSecondary leading-relaxed prose prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Accordion for expandable sections
function Accordion({
  title,
  children,
  defaultOpen = false,
  icon,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-1 text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors"
      >
        {isOpen ? (
          <ChevronDownIcon className="w-4 h-4" />
        ) : (
          <ChevronRightIcon className="w-4 h-4" />
        )}
        {icon}
        <span>{title}</span>
      </button>
      {isOpen && (
        <div className="ml-5 mt-2 pl-3 border-l border-bolt-elements-borderColor">
          {children}
        </div>
      )}
    </div>
  );
}

// Tool result display
function ToolResult({
  toolName,
  input,
  output,
  state,
}: {
  toolName: string;
  input?: unknown;
  output?: unknown;
  state?: string;
}) {
  const hasOutput = state === 'output-available' && output !== undefined;
  const isRunning = state === 'input-available' || (!state && !output);

  const formattedOutput = useMemo(() => {
    if (!output) return null;
    if (typeof output === 'string') return output;
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  }, [output]);

  return (
    <Accordion
      title={
        <span className="flex items-center gap-1">
          <span className="text-bolt-elements-textSecondary">{toolName}</span>
          {hasOutput && <span className="text-green-400">completed</span>}
          {isRunning && <span className="text-yellow-400">running...</span>}
        </span>
      }
      defaultOpen={isRunning}
    >
      {formattedOutput && (
        <pre className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-2/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
          {formattedOutput}
        </pre>
      )}
    </Accordion>
  );
}

// Thinking/reasoning display
function ThinkingBlock({ content, isActive }: { content: string; isActive: boolean }) {
  return (
    <Accordion
      title={
        isActive ? (
          <span className="text-purple-400 animate-pulse">Thinking...</span>
        ) : (
          <span className="text-bolt-elements-textTertiary">Thinking Process</span>
        )
      }
      defaultOpen={isActive}
    >
      <div className="text-sm italic text-bolt-elements-textTertiary">
        <MarkdownContent content={content} />
      </div>
    </Accordion>
  );
}

// Loading spinner
function LoadingSpinner() {
  return (
    <div className="flex gap-3 py-4">
      <SparklesIcon className="w-5 h-5 text-purple-400 animate-pulse" />
      <SparklesIcon className="w-5 h-5 text-purple-500 animate-pulse delay-100" />
      <SparklesIcon className="w-5 h-5 text-purple-600 animate-pulse delay-200" />
    </div>
  );
}

// Image gallery for generated images
function ImageGallery({
  images,
}: {
  images: Array<{ filename: string; pathname: string }>;
}) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto py-2">
        {images.map((image) => (
          <div
            key={image.filename}
            className="relative flex-shrink-0 group cursor-pointer"
            onClick={() => setLightboxImage(image.pathname)}
          >
            <img
              src={image.pathname}
              alt={image.filename}
              className="h-32 w-auto rounded-lg object-cover border border-bolt-elements-borderColor group-hover:border-accent-500 transition-colors"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
              <span className="text-xs text-white">Click to enlarge</span>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt="Enlarged view"
            className="max-w-full max-h-full object-contain"
          />
          <button
            className="absolute top-4 right-4 text-white text-2xl hover:text-bolt-elements-textSecondary"
            onClick={() => setLightboxImage(null)}
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}

// Main Generation View component
export function GenerationView({ generation }: { generation: Generation }) {
  // Handle failed generation
  if (generation.status === 'failed') {
    return (
      <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
        <p className="text-red-400 text-sm">{generation.error?.message || 'Generation failed'}</p>
        <p className="text-xs text-bolt-elements-textTertiary mt-1">ID: {generation.id}</p>
      </div>
    );
  }

  // Handle pending/queued states
  if (generation.status !== 'running' && generation.status !== 'completed' && generation.status !== 'cancelled') {
    return <LoadingSpinner />;
  }

  // Process messages
  const generatedMessages = useMemo(() => {
    if (!generation.messages) return [];
    return generation.messages
      .filter((m) => m.role === 'assistant')
      .map((message) => {
        // Merge adjacent text parts
        const mergedParts: typeof message.parts = [];
        let textBuffer = '';

        for (const part of message.parts) {
          if (part.type === 'text' && part.text) {
            textBuffer += part.text;
          } else {
            if (textBuffer) {
              mergedParts.push({ type: 'text', text: textBuffer });
              textBuffer = '';
            }
            mergedParts.push(part);
          }
        }
        if (textBuffer) {
          mergedParts.push({ type: 'text', text: textBuffer });
        }

        return { ...message, parts: mergedParts };
      });
  }, [generation.messages]);

  return (
    <div className="space-y-4">
      {/* Display generated images */}
      {generation.status === 'completed' &&
        generation.outputs?.map((output) => {
          if (output.type !== 'generated-image' || !output.contents) return null;
          return (
            <ImageGallery key={output.outputId} images={output.contents} />
          );
        })}

      {/* Display message content */}
      {generatedMessages.map((message, msgIndex) => (
        <div key={message.id || msgIndex} className="space-y-2">
          {message.parts.map((part, partIndex) => {
            const isLastPart = partIndex === message.parts.length - 1;
            const partKey = `${message.id}-${partIndex}-${part.type}`;

            // Tool calls
            if (part.type.startsWith('tool-')) {
              return (
                <ToolResult
                  key={partKey}
                  toolName={part.type.replace('tool-', '')}
                  input={part.input}
                  output={part.output}
                  state={part.state}
                />
              );
            }

            switch (part.type) {
              case 'step-start':
                return <Fragment key={partKey} />;

              case 'reasoning':
                return (
                  <ThinkingBlock
                    key={partKey}
                    content={part.text || ''}
                    isActive={isLastPart && generation.status === 'running'}
                  />
                );

              case 'text':
                return (
                  <div key={partKey}>
                    <MarkdownContent content={part.text || ''} />
                  </div>
                );

              default:
                return null;
            }
          })}
        </div>
      ))}

      {/* Show spinner while running and no reasoning is shown */}
      {generation.status === 'running' &&
        !generatedMessages.some((m) =>
          m.parts.some((p) => p.type === 'reasoning')
        ) && <LoadingSpinner />}
    </div>
  );
}

// Generation status badge
export function GenerationStatusBadge({
  status,
  className,
}: {
  status: Generation['status'];
  className?: string;
}) {
  const statusConfig = {
    pending: { color: 'bg-bolt-elements-background-depth-3', text: 'Pending' },
    queued: { color: 'bg-yellow-500', text: 'Queued' },
    running: { color: 'bg-blue-500', text: 'Running' },
    completed: { color: 'bg-green-500', text: 'Completed' },
    failed: { color: 'bg-red-500', text: 'Failed' },
    cancelled: { color: 'bg-bolt-elements-background-depth-3', text: 'Cancelled' },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        className
      )}
    >
      <span className={classNames('w-1.5 h-1.5 rounded-full', config.color)} />
      <span className="text-bolt-elements-textSecondary">{config.text}</span>
    </span>
  );
}
