/**
 * SplitPane - Advanced resizable split pane component
 *
 * Features:
 * - Horizontal and vertical splitting
 * - Drag-to-resize with smooth transitions
 * - Double-click to reset to default
 * - Collapse/expand panes
 * - Min/max size constraints
 * - Keyboard accessibility
 * - Persistence of sizes to localStorage
 * - Visual resize handle with hover state
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { classNames } from '~/utils/classNames';

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitPaneProps {
  /** Direction of the split */
  direction?: SplitDirection;
  /** Initial size of the first pane in percentage (0-100) */
  defaultSize?: number;
  /** Minimum size of first pane in percentage */
  minSize?: number;
  /** Maximum size of first pane in percentage */
  maxSize?: number;
  /** First pane content */
  firstPane: React.ReactNode;
  /** Second pane content */
  secondPane: React.ReactNode;
  /** Callback when size changes */
  onSizeChange?: (size: number) => void;
  /** Storage key for persisting size */
  storageKey?: string;
  /** Whether first pane is collapsible */
  firstCollapsible?: boolean;
  /** Whether second pane is collapsible */
  secondCollapsible?: boolean;
  /** Whether first pane is currently collapsed */
  firstCollapsed?: boolean;
  /** Whether second pane is currently collapsed */
  secondCollapsed?: boolean;
  /** Callback when first pane collapse state changes */
  onFirstCollapseChange?: (collapsed: boolean) => void;
  /** Callback when second pane collapse state changes */
  onSecondCollapseChange?: (collapsed: boolean) => void;
  /** Custom handle content */
  handleContent?: React.ReactNode;
  /** CSS class for container */
  className?: string;
  /** CSS class for first pane */
  firstPaneClassName?: string;
  /** CSS class for second pane */
  secondPaneClassName?: string;
  /** CSS class for handle */
  handleClassName?: string;
}

const COLLAPSED_SIZE = 0;
const HANDLE_SIZE = 4; // px

export const SplitPane = memo(({
  direction = 'horizontal',
  defaultSize = 50,
  minSize = 10,
  maxSize = 90,
  firstPane,
  secondPane,
  onSizeChange,
  storageKey,
  firstCollapsible = false,
  secondCollapsible = false,
  firstCollapsed = false,
  secondCollapsed = false,
  onFirstCollapseChange,
  onSecondCollapseChange,
  handleContent,
  className,
  firstPaneClassName,
  secondPaneClassName,
  handleClassName,
}: SplitPaneProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => {
    // Load from storage if available
    if (storageKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`splitpane_${storageKey}`);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed >= minSize && parsed <= maxSize) {
          return parsed;
        }
      }
    }
    return defaultSize;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const dragStartRef = useRef<{ position: number; size: number } | null>(null);

  const isHorizontal = direction === 'horizontal';

  // Save to storage when size changes
  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(`splitpane_${storageKey}`, String(size));
    }
    onSizeChange?.(size);
  }, [size, storageKey, onSizeChange]);

  // Handle mouse move during drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const containerSize = isHorizontal ? rect.width : rect.height;
    const currentPosition = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top;

    let newSize = (currentPosition / containerSize) * 100;
    newSize = Math.max(minSize, Math.min(maxSize, newSize));

    setSize(newSize);
  }, [isHorizontal, minSize, maxSize]);

  // Handle mouse up to end drag
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Setup drag listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, isHorizontal]);

  // Start dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const position = isHorizontal ? e.clientX : e.clientY;
    dragStartRef.current = { position, size };
    setIsDragging(true);
  }, [isHorizontal, size]);

  // Double-click to reset
  const handleDoubleClick = useCallback(() => {
    setSize(defaultSize);
  }, [defaultSize]);

  // Keyboard accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;

    if (isHorizontal) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSize(s => Math.max(minSize, s - step));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSize(s => Math.min(maxSize, s + step));
      }
    } else {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSize(s => Math.max(minSize, s - step));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSize(s => Math.min(maxSize, s + step));
      }
    }

    // Reset on Home key
    if (e.key === 'Home') {
      e.preventDefault();
      setSize(defaultSize);
    }
  }, [isHorizontal, minSize, maxSize, defaultSize]);

  // Calculate actual sizes accounting for collapse
  const firstPaneSize = firstCollapsed ? COLLAPSED_SIZE : (secondCollapsed ? 100 : size);
  const secondPaneSize = secondCollapsed ? COLLAPSED_SIZE : (firstCollapsed ? 100 : 100 - size);

  return (
    <div
      ref={containerRef}
      className={classNames(
        'flex h-full w-full overflow-hidden',
        isHorizontal ? 'flex-row' : 'flex-col',
        className
      )}
    >
      {/* First Pane */}
      <div
        className={classNames(
          'overflow-hidden transition-all duration-150',
          firstCollapsed && 'pointer-events-none',
          firstPaneClassName
        )}
        style={{
          [isHorizontal ? 'width' : 'height']: `calc(${firstPaneSize}% - ${HANDLE_SIZE / 2}px)`,
          flexShrink: 0,
        }}
      >
        {firstPane}
      </div>

      {/* Resize Handle */}
      <div
        className={classNames(
          'relative flex items-center justify-center shrink-0',
          'bg-recoder-elements-borderColor transition-colors duration-150',
          isHorizontal ? 'cursor-col-resize' : 'cursor-row-resize',
          (isDragging || isHovering) && 'bg-blue-500',
          handleClassName
        )}
        style={{
          [isHorizontal ? 'width' : 'height']: `${HANDLE_SIZE}px`,
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        tabIndex={0}
        role="separator"
        aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(size)}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        aria-label="Resize panes"
      >
        {handleContent || (
          <div
            className={classNames(
              'rounded-full bg-recoder-elements-textTertiary/30 transition-all duration-150',
              isHorizontal ? 'h-8 w-1' : 'w-8 h-1',
              (isDragging || isHovering) && 'bg-white/80 scale-110'
            )}
          />
        )}

        {/* Collapse buttons */}
        {(firstCollapsible || secondCollapsible) && (isHovering || isDragging) && (
          <div
            className={classNames(
              'absolute flex gap-1 z-10',
              isHorizontal ? 'top-1/2 -translate-y-1/2 flex-col' : 'left-1/2 -translate-x-1/2 flex-row'
            )}
          >
            {firstCollapsible && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFirstCollapseChange?.(!firstCollapsed);
                }}
                className={classNames(
                  'w-5 h-5 rounded bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor',
                  'flex items-center justify-center text-xs text-recoder-elements-textSecondary',
                  'hover:bg-recoder-elements-background-depth-4 hover:text-recoder-elements-textPrimary',
                  'transition-colors'
                )}
                title={firstCollapsed ? 'Expand first pane' : 'Collapse first pane'}
              >
                <div className={classNames(
                  isHorizontal
                    ? (firstCollapsed ? 'i-ph:caret-right' : 'i-ph:caret-left')
                    : (firstCollapsed ? 'i-ph:caret-down' : 'i-ph:caret-up')
                )} />
              </button>
            )}
            {secondCollapsible && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSecondCollapseChange?.(!secondCollapsed);
                }}
                className={classNames(
                  'w-5 h-5 rounded bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor',
                  'flex items-center justify-center text-xs text-recoder-elements-textSecondary',
                  'hover:bg-recoder-elements-background-depth-4 hover:text-recoder-elements-textPrimary',
                  'transition-colors'
                )}
                title={secondCollapsed ? 'Expand second pane' : 'Collapse second pane'}
              >
                <div className={classNames(
                  isHorizontal
                    ? (secondCollapsed ? 'i-ph:caret-left' : 'i-ph:caret-right')
                    : (secondCollapsed ? 'i-ph:caret-up' : 'i-ph:caret-down')
                )} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Second Pane */}
      <div
        className={classNames(
          'flex-1 overflow-hidden transition-all duration-150',
          secondCollapsed && 'pointer-events-none',
          secondPaneClassName
        )}
        style={{
          [isHorizontal ? 'width' : 'height']: `calc(${secondPaneSize}% - ${HANDLE_SIZE / 2}px)`,
        }}
      >
        {secondPane}
      </div>
    </div>
  );
});

SplitPane.displayName = 'SplitPane';

export default SplitPane;
