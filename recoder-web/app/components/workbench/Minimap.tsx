/**
 * Minimap - Code minimap component for file navigation
 *
 * Features:
 * - Visual overview of entire file
 * - Click to navigate to position
 * - Drag to scroll
 * - Highlights current viewport
 * - Shows syntax highlighting hints
 * - Highlights errors/warnings
 * - Shows search result positions
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classNames } from '~/utils/classNames';

export interface MinimapMarker {
  line: number;
  type: 'error' | 'warning' | 'info' | 'search' | 'bookmark' | 'change';
  message?: string;
}

export interface MinimapProps {
  /** Source code content */
  content: string;
  /** Current scroll position (line number) */
  scrollLine?: number;
  /** Number of visible lines in viewport */
  visibleLines?: number;
  /** Total lines in document */
  totalLines?: number;
  /** Markers to display (errors, warnings, search results) */
  markers?: MinimapMarker[];
  /** Callback when user clicks to navigate */
  onNavigate?: (line: number) => void;
  /** Whether minimap is visible */
  visible?: boolean;
  /** Width of minimap in pixels */
  width?: number;
  /** CSS class */
  className?: string;
}

// Simple syntax detection for coloring
type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'default';

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: '#c586c0',
  string: '#ce9178',
  comment: '#6a9955',
  number: '#b5cea8',
  default: '#9cdcfe',
};

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await',
  'try', 'catch', 'throw', 'new', 'this', 'super', 'static', 'public', 'private',
  'interface', 'type', 'enum', 'implements', 'readonly', 'abstract', 'declare',
]);

// Simple tokenizer for syntax hints
function getLineTokens(line: string): Array<{ type: TokenType; width: number }> {
  const tokens: Array<{ type: TokenType; width: number }> = [];
  const words = line.split(/(\s+|[{}()[\];,.])/);

  for (const word of words) {
    if (!word) continue;

    let type: TokenType = 'default';

    if (word.startsWith('//') || word.startsWith('/*')) {
      type = 'comment';
    } else if (/^["'`]/.test(word)) {
      type = 'string';
    } else if (/^\d/.test(word)) {
      type = 'number';
    } else if (KEYWORDS.has(word.toLowerCase())) {
      type = 'keyword';
    }

    tokens.push({ type, width: Math.min(word.length, 20) });
  }

  return tokens;
}

const MARKER_COLORS: Record<MinimapMarker['type'], string> = {
  error: '#f44747',
  warning: '#ffcc00',
  info: '#3794ff',
  search: '#f9a825',
  bookmark: '#b39ddb',
  change: '#4caf50',
};

export const Minimap = memo(({
  content,
  scrollLine = 0,
  visibleLines = 30,
  totalLines,
  markers = [],
  onNavigate,
  visible = true,
  width = 80,
  className,
}: MinimapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [containerHeight, setContainerHeight] = useState(0);

  // Parse lines from content
  const lines = useMemo(() => content.split('\n'), [content]);
  const lineCount = totalLines || lines.length;

  // Calculate scaling factor
  const lineHeight = 2; // pixels per line in minimap
  const minimapHeight = lineCount * lineHeight;
  const scale = containerHeight > 0 ? Math.min(1, containerHeight / minimapHeight) : 1;
  const scaledLineHeight = lineHeight * scale;

  // Observe container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = containerHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = 'transparent';
    ctx.clearRect(0, 0, width, containerHeight);

    // Draw lines
    lines.forEach((line, index) => {
      if (index * scaledLineHeight > containerHeight) return;

      const y = index * scaledLineHeight;
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;

      // Simple line representation
      if (trimmed.length > 0) {
        const tokens = getLineTokens(trimmed);
        let x = Math.min(indent * 0.5, 10);

        tokens.forEach((token) => {
          ctx.fillStyle = TOKEN_COLORS[token.type];
          ctx.globalAlpha = 0.6;
          ctx.fillRect(x, y, Math.min(token.width * 0.8, width - x - 2), scaledLineHeight - 0.5);
          x += token.width * 0.8 + 1;
        });
      }
    });

    // Draw markers
    markers.forEach((marker) => {
      const y = (marker.line - 1) * scaledLineHeight;
      ctx.fillStyle = MARKER_COLORS[marker.type];
      ctx.globalAlpha = 0.8;
      ctx.fillRect(width - 4, y, 4, scaledLineHeight);
    });

    ctx.globalAlpha = 1;
  }, [content, lines, markers, visible, width, containerHeight, scaledLineHeight]);

  // Handle click to navigate
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const line = Math.floor(y / scaledLineHeight) + 1;

    onNavigate?.(Math.min(line, lineCount));
  }, [scaledLineHeight, lineCount, onNavigate]);

  // Handle drag
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleClick(e);
  }, [handleClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      handleClick(e);
    }
  }, [isDragging, handleClick]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDragging, handleMouseUp]);

  // Calculate viewport indicator position
  const viewportTop = (scrollLine - 1) * scaledLineHeight;
  const viewportHeight = visibleLines * scaledLineHeight;

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className={classNames(
        'relative select-none cursor-pointer',
        'bg-bolt-elements-background-depth-2/50',
        className
      )}
      style={{ width }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
    >
      {/* Canvas for code rendering */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width, height: containerHeight }}
      />

      {/* Viewport indicator */}
      <div
        className={classNames(
          'absolute left-0 right-0 pointer-events-none',
          'bg-bolt-elements-textPrimary/10',
          'border-y border-bolt-elements-textPrimary/20',
          'transition-all duration-75'
        )}
        style={{
          top: Math.max(0, viewportTop),
          height: Math.min(viewportHeight, containerHeight - viewportTop),
        }}
      />

      {/* Hover tooltip for markers */}
      {markers.map((marker, i) => (
        <div
          key={`marker-${marker.line}-${i}`}
          className="absolute right-0 w-1 group"
          style={{
            top: (marker.line - 1) * scaledLineHeight,
            height: scaledLineHeight,
          }}
        >
          {marker.message && (
            <div
              className={classNames(
                'absolute right-full mr-2 px-2 py-1 rounded text-xs',
                'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                'text-bolt-elements-textPrimary whitespace-nowrap',
                'opacity-0 group-hover:opacity-100 pointer-events-none',
                'transition-opacity duration-150 z-50'
              )}
              style={{ top: -4 }}
            >
              {marker.message}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

Minimap.displayName = 'Minimap';

export default Minimap;
