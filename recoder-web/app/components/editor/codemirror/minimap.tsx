/**
 * CodeMirror Minimap Component
 *
 * A canvas-based minimap that shows a zoomed-out view of the entire file
 * with syntax highlighting colors preserved.
 */

import { useEffect, useRef, useCallback, memo } from 'react';
import type { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { classNames } from '~/utils/classNames';

interface MinimapProps {
  view: EditorView | undefined;
  theme: 'light' | 'dark';
  className?: string;
}

// Syntax highlighting colors (matching VS Code dark theme)
const DARK_COLORS: Record<string, string> = {
  keyword: '#c586c0',
  controlKeyword: '#c586c0',
  operatorKeyword: '#c586c0',
  definitionKeyword: '#c586c0',
  moduleKeyword: '#c586c0',
  comment: '#6a9955',
  lineComment: '#6a9955',
  blockComment: '#6a9955',
  docComment: '#6a9955',
  string: '#ce9178',
  number: '#b5cea8',
  bool: '#569cd6',
  null: '#569cd6',
  atom: '#569cd6',
  function: '#dcdcaa',
  variableName: '#9cdcfe',
  definition: '#4ec9b0',
  typeName: '#4ec9b0',
  className: '#4ec9b0',
  propertyName: '#9cdcfe',
  operator: '#d4d4d4',
  punctuation: '#d4d4d4',
  paren: '#d4d4d4',
  brace: '#d4d4d4',
  bracket: '#d4d4d4',
  regexp: '#d16969',
  tagName: '#569cd6',
  attributeName: '#9cdcfe',
  attributeValue: '#ce9178',
  default: '#d4d4d4',
};

const LIGHT_COLORS: Record<string, string> = {
  keyword: '#af00db',
  controlKeyword: '#af00db',
  operatorKeyword: '#af00db',
  definitionKeyword: '#af00db',
  moduleKeyword: '#af00db',
  comment: '#008000',
  lineComment: '#008000',
  blockComment: '#008000',
  docComment: '#008000',
  string: '#a31515',
  number: '#098658',
  bool: '#0000ff',
  null: '#0000ff',
  atom: '#0000ff',
  function: '#795e26',
  variableName: '#001080',
  definition: '#267f99',
  typeName: '#267f99',
  className: '#267f99',
  propertyName: '#001080',
  operator: '#000000',
  punctuation: '#000000',
  paren: '#000000',
  brace: '#000000',
  bracket: '#000000',
  regexp: '#811f3f',
  tagName: '#800000',
  attributeName: '#ff0000',
  attributeValue: '#0000ff',
  default: '#000000',
};

// Configuration
const MINIMAP_WIDTH = 100;
const LINE_HEIGHT = 2;
const CHAR_WIDTH = 1;
const MAX_CHARS_PER_LINE = 80;
const VIEWPORT_OVERLAY_COLOR_DARK = 'rgba(255, 255, 255, 0.1)';
const VIEWPORT_OVERLAY_COLOR_LIGHT = 'rgba(0, 0, 0, 0.1)';
const VIEWPORT_BORDER_COLOR_DARK = 'rgba(255, 255, 255, 0.3)';
const VIEWPORT_BORDER_COLOR_LIGHT = 'rgba(0, 0, 0, 0.3)';

export const Minimap = memo(({ view, theme, className }: MinimapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  const colors = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff';
  const viewportOverlayColor = theme === 'dark' ? VIEWPORT_OVERLAY_COLOR_DARK : VIEWPORT_OVERLAY_COLOR_LIGHT;
  const viewportBorderColor = theme === 'dark' ? VIEWPORT_BORDER_COLOR_DARK : VIEWPORT_BORDER_COLOR_LIGHT;

  // Get token type from syntax tree
  const getTokenType = useCallback((view: EditorView, from: number, to: number): string => {
    try {
      const tree = syntaxTree(view.state);
      let tokenType = 'default';

      tree.iterate({
        from,
        to,
        enter: (node) => {
          const name = node.name.toLowerCase();
          // Check for specific token types
          if (name.includes('comment')) {
            tokenType = 'comment';
          } else if (name.includes('string') || name.includes('template')) {
            tokenType = 'string';
          } else if (name.includes('number') || name.includes('integer') || name.includes('float')) {
            tokenType = 'number';
          } else if (name.includes('keyword') || name.includes('control') || name === 'if' || name === 'else' || name === 'return' || name === 'for' || name === 'while' || name === 'function' || name === 'const' || name === 'let' || name === 'var' || name === 'import' || name === 'export' || name === 'from' || name === 'class' || name === 'interface' || name === 'type') {
            tokenType = 'keyword';
          } else if (name.includes('function') || name.includes('call') || name.includes('method')) {
            tokenType = 'function';
          } else if (name.includes('type') || name.includes('class') || name.includes('interface')) {
            tokenType = 'typeName';
          } else if (name.includes('property') || name.includes('member')) {
            tokenType = 'propertyName';
          } else if (name.includes('variable') || name.includes('identifier')) {
            tokenType = 'variableName';
          } else if (name.includes('operator')) {
            tokenType = 'operator';
          } else if (name.includes('punctuation') || name.includes('paren') || name.includes('brace') || name.includes('bracket')) {
            tokenType = 'punctuation';
          } else if (name.includes('bool') || name === 'true' || name === 'false') {
            tokenType = 'bool';
          } else if (name.includes('null') || name.includes('undefined')) {
            tokenType = 'null';
          } else if (name.includes('regexp')) {
            tokenType = 'regexp';
          } else if (name.includes('tag')) {
            tokenType = 'tagName';
          } else if (name.includes('attribute')) {
            if (name.includes('value')) {
              tokenType = 'attributeValue';
            } else {
              tokenType = 'attributeName';
            }
          }
        },
      });

      return tokenType;
    } catch {
      return 'default';
    }
  }, []);

  // Render the minimap
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !view) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const doc = view.state.doc;
    const totalLines = doc.lines;
    const scrollDOM = view.scrollDOM;

    // Calculate canvas dimensions
    const containerHeight = container.clientHeight;
    const contentHeight = totalLines * LINE_HEIGHT;
    const canvasHeight = Math.max(containerHeight, contentHeight);

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${MINIMAP_WIDTH}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, MINIMAP_WIDTH, canvasHeight);

    // Calculate scroll ratio for minimap
    const maxScroll = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    const scrollRatio = maxScroll > 0 ? scrollDOM.scrollTop / maxScroll : 0;
    const minimapMaxScroll = Math.max(0, contentHeight - containerHeight);
    const minimapScrollOffset = minimapMaxScroll * scrollRatio;

    // Calculate visible viewport in minimap coordinates
    const viewportTop = (scrollDOM.scrollTop / scrollDOM.scrollHeight) * contentHeight;
    const viewportHeight = (scrollDOM.clientHeight / scrollDOM.scrollHeight) * contentHeight;

    // Render lines
    for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
      const y = (lineNum - 1) * LINE_HEIGHT - minimapScrollOffset;

      // Skip lines outside visible area
      if (y < -LINE_HEIGHT || y > containerHeight + LINE_HEIGHT) continue;

      const line = doc.line(lineNum);
      const lineText = line.text;

      // Render each character with appropriate color
      let x = 2; // Left padding
      let charIndex = 0;

      for (const char of lineText) {
        if (x >= MINIMAP_WIDTH - 2) break;

        if (char !== ' ' && char !== '\t') {
          // Get token type and color
          const from = line.from + charIndex;
          const to = from + 1;
          const tokenType = getTokenType(view, from, to);
          const color = colors[tokenType] || colors.default;

          ctx.fillStyle = color;
          ctx.fillRect(x, y, CHAR_WIDTH, LINE_HEIGHT - 0.5);
        }

        x += char === '\t' ? CHAR_WIDTH * 2 : CHAR_WIDTH;
        charIndex++;

        if (charIndex > MAX_CHARS_PER_LINE) break;
      }
    }

    // Draw viewport overlay
    const overlayTop = viewportTop - minimapScrollOffset;
    const overlayHeight = Math.max(viewportHeight, 20);

    ctx.fillStyle = viewportOverlayColor;
    ctx.fillRect(0, overlayTop, MINIMAP_WIDTH, overlayHeight);

    // Draw viewport border
    ctx.strokeStyle = viewportBorderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, overlayTop + 0.5, MINIMAP_WIDTH - 1, overlayHeight - 1);
  }, [view, bgColor, colors, getTokenType, viewportOverlayColor, viewportBorderColor]);

  // Handle click/drag to navigate
  const handleMinimapInteraction = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!view || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const containerHeight = containerRef.current.clientHeight;

    const doc = view.state.doc;
    const totalLines = doc.lines;
    const contentHeight = totalLines * LINE_HEIGHT;

    // Calculate scroll offset
    const scrollDOM = view.scrollDOM;
    const maxScroll = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    const scrollRatio = maxScroll > 0 ? scrollDOM.scrollTop / maxScroll : 0;
    const minimapMaxScroll = Math.max(0, contentHeight - containerHeight);
    const minimapScrollOffset = minimapMaxScroll * scrollRatio;

    // Calculate target line
    const targetY = y + minimapScrollOffset;
    const targetLine = Math.floor(targetY / LINE_HEIGHT) + 1;
    const clampedLine = Math.max(1, Math.min(targetLine, totalLines));

    // Scroll to target position
    const lineInfo = doc.line(clampedLine);
    const targetScrollTop = view.lineBlockAt(lineInfo.from).top - scrollDOM.clientHeight / 2;

    scrollDOM.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: isDraggingRef.current ? 'auto' : 'smooth',
    });
  }, [view]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    handleMinimapInteraction(e);

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        handleMinimapInteraction(e);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleMinimapInteraction]);

  // Set up render loop and event listeners
  useEffect(() => {
    if (!view) return;

    const scheduleRender = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(render);
    };

    // Initial render
    scheduleRender();

    // Listen for scroll events
    const scrollDOM = view.scrollDOM;
    scrollDOM.addEventListener('scroll', scheduleRender);

    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(scheduleRender);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Re-render when view content changes
    const interval = setInterval(scheduleRender, 1000);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      scrollDOM.removeEventListener('scroll', scheduleRender);
      resizeObserver.disconnect();
      clearInterval(interval);
    };
  }, [view, render]);

  // Re-render when theme changes
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(render);
  }, [theme, render]);

  if (!view) return null;

  return (
    <div
      ref={containerRef}
      className={classNames(
        'relative h-full overflow-hidden cursor-pointer select-none',
        theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-white',
        className
      )}
      style={{ width: MINIMAP_WIDTH }}
      onMouseDown={handleMouseDown}
    >
      <canvas
        ref={canvasRef}
        className="block"
      />
    </div>
  );
});

Minimap.displayName = 'Minimap';

export default Minimap;
