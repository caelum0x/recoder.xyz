import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as XTerm } from '@xterm/xterm';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react';
import type { Theme } from '~/lib/stores/theme';
import { createScopedLogger } from '~/utils/logger';
import { getTerminalTheme } from './theme';
import { useCopyToClipboard } from '~/lib/hooks/useCopyToClipboard';

const logger = createScopedLogger('Terminal');

export interface TerminalRef {
  reloadStyles: () => void;
}

export interface TerminalProps {
  className?: string;
  theme: Theme;
  readonly?: boolean;
  onTerminalReady?: (terminal: XTerm) => void;
  onTerminalResize?: (cols: number, rows: number) => void;
}

interface ContextMenu {
  x: number;
  y: number;
  show: boolean;
}

export const Terminal = memo(
  forwardRef<TerminalRef, TerminalProps>(({ className, theme, readonly, onTerminalReady, onTerminalResize }, ref) => {
    const terminalElementRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<XTerm>();
    const [isDragging, setIsDragging] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenu>({ x: 0, y: 0, show: false });
    const { copy, copied } = useCopyToClipboard();

    useEffect(() => {
      const element = terminalElementRef.current!;

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      const terminal = new XTerm({
        cursorBlink: true,
        convertEol: true,
        disableStdin: readonly,
        theme: getTerminalTheme(readonly ? { cursor: '#00000000' } : {}),
        fontSize: 12,
        fontFamily: 'Menlo, courier-new, courier, monospace',
        scrollback: 10000,
        allowProposedApi: true,
      });

      terminalRef.current = terminal;

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(element);

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        onTerminalResize?.(terminal.cols, terminal.rows);
      });

      resizeObserver.observe(element);

      logger.info('Attach terminal');

      onTerminalReady?.(terminal);

      return () => {
        resizeObserver.disconnect();
        terminal.dispose();
      };
    }, []);

    useEffect(() => {
      const terminal = terminalRef.current!;
      terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});
      terminal.options.disableStdin = readonly;
    }, [theme, readonly]);

    useImperativeHandle(ref, () => {
      return {
        reloadStyles: () => {
          const terminal = terminalRef.current!;
          terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});
        },
      };
    }, []);

    // Context menu handlers
    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, show: true });
    };

    const closeContextMenu = useCallback(() => setContextMenu(prev => ({ ...prev, show: false })), []);

    const handleCopy = useCallback(async () => {
      const selection = terminalRef.current?.getSelection();
      if (selection) await copy(selection);
      closeContextMenu();
    }, [copy, closeContextMenu]);

    const handlePaste = async () => {
      const text = await navigator.clipboard.readText();
      terminalRef.current?.paste(text);
      closeContextMenu();
    };

    const handleClear = () => {
      terminalRef.current?.clear();
      closeContextMenu();
    };

    const handleSelectAll = () => {
      terminalRef.current?.selectAll();
      closeContextMenu();
    };

    // Close context menu on click outside
    useEffect(() => {
      if (contextMenu.show) {
        const handler = () => closeContextMenu();
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
      }
    }, [contextMenu.show]);

    // Handle drag & drop of files/folders
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const terminal = terminalRef.current;
      if (!terminal || readonly) return;

      const paths: string[] = [];
      
      const uriList = e.dataTransfer.getData('text/uri-list');
      if (uriList) {
        uriList.split('\n').filter(uri => uri.trim()).forEach(uri => {
          if (uri.startsWith('file://')) {
            paths.push(decodeURIComponent(uri.replace('file://', '')));
          }
        });
      }

      if (paths.length === 0) {
        const text = e.dataTransfer.getData('text/plain');
        if (text && text.startsWith('/')) paths.push(text);
      }

      if (paths.length === 0 && e.dataTransfer.files.length > 0) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          paths.push((file as any).path || file.name);
        }
      }

      if (paths.length > 0) {
        const pathString = paths.map(p => p.includes(' ') ? `"${p}"` : p).join(' ');
        terminal.paste(pathString);
        logger.info('Dropped paths:', pathString);
      }
    };

    return (
      <div className="relative">
        <div 
          className={`${className} ${isDragging ? 'ring-2 ring-blue-500 ring-inset' : ''}`} 
          ref={terminalElementRef}
          onContextMenu={handleContextMenu}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
        {contextMenu.show && (
          <div 
            className="fixed z-50 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md shadow-lg py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button onClick={handleCopy} className="w-full px-3 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3 flex items-center gap-2">
              <span className="text-xs text-bolt-elements-textTertiary">⌘C</span>
              {copied ? (
                <span className="text-green-400 flex items-center gap-1">
                  <div className="i-ph:check-bold text-xs" /> Copied
                </span>
              ) : 'Copy'}
            </button>
            <button onClick={handlePaste} className="w-full px-3 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3 flex items-center gap-2">
              <span className="text-xs text-bolt-elements-textTertiary">⌘V</span> Paste
            </button>
            <div className="border-t border-bolt-elements-borderColor my-1" />
            <button onClick={handleSelectAll} className="w-full px-3 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3 flex items-center gap-2">
              <span className="text-xs text-bolt-elements-textTertiary">⌘A</span> Select All
            </button>
            <button onClick={handleClear} className="w-full px-3 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3">
              Clear
            </button>
          </div>
        )}
      </div>
    );
  }),
);
