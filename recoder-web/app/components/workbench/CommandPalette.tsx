/**
 * CommandPalette - VS Code style command palette
 *
 * Features:
 * - Ctrl+P/Cmd+K to open
 * - Fuzzy file search (default)
 * - Command mode (> prefix)
 * - Go to line mode (: prefix)
 * - Symbol search (@ prefix)
 * - Recent files section
 * - Keyboard navigation
 * - Theme-aware styling
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { atom, computed } from 'nanostores';
import { useStore } from '@nanostores/react';
import Fuse from 'fuse.js';
import { motion, AnimatePresence } from 'framer-motion';
import { workbenchStore } from '~/lib/stores/workbench';
import type { FileMap } from '~/lib/stores/files';
import { classNames } from '~/utils/classNames';

// =============================================================================
// Types
// =============================================================================

export type PaletteMode = 'files' | 'commands' | 'lines' | 'symbols';

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  category?: string;
  action: () => void | Promise<void>;
}

export interface FileResult {
  path: string;
  name: string;
  directory: string;
  isRecent?: boolean;
}

export interface SymbolResult {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'constant' | 'method' | 'property';
  line: number;
  file?: string;
}

// =============================================================================
// Store
// =============================================================================

// Global state for command palette
export const commandPaletteOpen = atom<boolean>(false);
export const commandPaletteMode = atom<PaletteMode>('files');
export const commandPaletteQuery = atom<string>('');
export const registeredCommands = atom<Command[]>([]);

// Open/close functions
export function openCommandPalette(mode: PaletteMode = 'files') {
  commandPaletteMode.set(mode);
  commandPaletteQuery.set(mode === 'commands' ? '>' : mode === 'lines' ? ':' : mode === 'symbols' ? '@' : '');
  commandPaletteOpen.set(true);
}

export function closeCommandPalette() {
  commandPaletteOpen.set(false);
  commandPaletteQuery.set('');
}

export function toggleCommandPalette() {
  if (commandPaletteOpen.get()) {
    closeCommandPalette();
  } else {
    openCommandPalette();
  }
}

// Register commands
export function registerCommands(commands: Command[]) {
  const existing = registeredCommands.get();
  const newCommands = [...existing];

  for (const cmd of commands) {
    const idx = newCommands.findIndex(c => c.id === cmd.id);
    if (idx >= 0) {
      newCommands[idx] = cmd;
    } else {
      newCommands.push(cmd);
    }
  }

  registeredCommands.set(newCommands);
}

export function unregisterCommand(id: string) {
  const existing = registeredCommands.get();
  registeredCommands.set(existing.filter(c => c.id !== id));
}

// =============================================================================
// Default Commands
// =============================================================================

function getDefaultCommands(): Command[] {
  return [
    // File operations
    {
      id: 'file.save',
      label: 'Save File',
      description: 'Save the current file',
      icon: 'i-ph:floppy-disk',
      shortcut: 'Cmd+S',
      category: 'File',
      action: () => workbenchStore.saveCurrentDocument(),
    },
    {
      id: 'file.saveAll',
      label: 'Save All Files',
      description: 'Save all unsaved files',
      icon: 'i-ph:floppy-disk',
      category: 'File',
      action: () => workbenchStore.saveAllFiles(),
    },
    {
      id: 'file.closeTab',
      label: 'Close Tab',
      description: 'Close the current editor tab',
      icon: 'i-ph:x',
      shortcut: 'Cmd+W',
      category: 'File',
      action: () => {
        const selected = workbenchStore.selectedFile.get();
        if (selected) workbenchStore.closeTab(selected);
      },
    },
    {
      id: 'file.closeAllTabs',
      label: 'Close All Tabs',
      description: 'Close all editor tabs',
      icon: 'i-ph:x-circle',
      category: 'File',
      action: () => workbenchStore.closeAllTabs(),
    },

    // View operations
    {
      id: 'view.togglePreview',
      label: 'Toggle Preview',
      description: 'Switch between code and preview',
      icon: 'i-ph:eye',
      shortcut: 'Cmd+P',
      category: 'View',
      action: () => {
        const current = workbenchStore.currentView.get();
        workbenchStore.currentView.set(current === 'code' ? 'preview' : 'code');
      },
    },
    {
      id: 'view.toggleTerminal',
      label: 'Toggle Terminal',
      description: 'Show or hide the terminal',
      icon: 'i-ph:terminal',
      shortcut: 'Cmd+`',
      category: 'View',
      action: () => workbenchStore.toggleTerminal(),
    },
    {
      id: 'view.toggleSplit',
      label: 'Toggle Split Editor',
      description: 'Split the editor view',
      icon: 'i-ph:columns',
      shortcut: 'Cmd+\\',
      category: 'View',
      action: () => workbenchStore.toggleSplit(),
    },

    // Editor operations
    {
      id: 'editor.formatDocument',
      label: 'Format Document',
      description: 'Format the current document',
      icon: 'i-ph:text-align-left',
      shortcut: 'Shift+Alt+F',
      category: 'Editor',
      action: () => {
        window.dispatchEvent(new CustomEvent('recoder:format-document'));
      },
    },

    // Git operations
    {
      id: 'git.commit',
      label: 'Git: Commit',
      description: 'Commit staged changes',
      icon: 'i-ph:git-commit',
      category: 'Git',
      action: () => {
        window.dispatchEvent(new CustomEvent('recoder:git-commit'));
      },
    },
    {
      id: 'git.push',
      label: 'Git: Push',
      description: 'Push commits to remote',
      icon: 'i-ph:cloud-arrow-up',
      category: 'Git',
      action: () => {
        window.dispatchEvent(new CustomEvent('recoder:git-push'));
      },
    },

    // Project operations
    {
      id: 'project.export',
      label: 'Export Project',
      description: 'Download project as ZIP',
      icon: 'i-ph:export',
      category: 'Project',
      action: () => {
        window.dispatchEvent(new CustomEvent('recoder:export-project'));
      },
    },
    {
      id: 'project.refreshFiles',
      label: 'Refresh Files',
      description: 'Reload file tree from container',
      icon: 'i-ph:arrow-clockwise',
      category: 'Project',
      action: () => workbenchStore.refreshFiles(),
    },
  ];
}

// =============================================================================
// File Icon Utilities
// =============================================================================

const FILE_ICONS: Record<string, string> = {
  ts: 'i-ph:file-ts text-blue-400',
  tsx: 'i-ph:file-tsx text-blue-500',
  js: 'i-ph:file-js text-yellow-400',
  jsx: 'i-ph:file-jsx text-yellow-500',
  json: 'i-ph:file text-yellow-300',
  html: 'i-ph:file-html text-orange-400',
  css: 'i-ph:file-css text-blue-300',
  md: 'i-ph:file-md text-bolt-elements-textTertiary',
  py: 'i-ph:file-py text-yellow-400',
  default: 'i-ph:file text-bolt-elements-textTertiary',
};

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

// =============================================================================
// Component
// =============================================================================

interface CommandPaletteProps {
  files?: FileMap;
  recentFiles?: string[];
  className?: string;
}

export const CommandPalette = memo(({ files, recentFiles = [], className }: CommandPaletteProps) => {
  const isOpen = useStore(commandPaletteOpen);
  const mode = useStore(commandPaletteMode);
  const query = useStore(commandPaletteQuery);
  const commands = useStore(registeredCommands);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Register default commands on mount
  useEffect(() => {
    registerCommands(getDefaultCommands());
  }, []);

  // Keyboard shortcut to open (Cmd+K or Cmd+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Cmd+P to open file search
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'p')) {
        e.preventDefault();
        if (isOpen) {
          closeCommandPalette();
        } else {
          openCommandPalette('files');
        }
        return;
      }

      // Cmd+Shift+P for command palette
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        if (isOpen) {
          closeCommandPalette();
        } else {
          openCommandPalette('commands');
        }
        return;
      }

      // Ctrl+G for go to line
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        openCommandPalette('lines');
        return;
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closeCommandPalette();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Detect mode from query prefix
  useEffect(() => {
    if (query.startsWith('>')) {
      commandPaletteMode.set('commands');
    } else if (query.startsWith(':')) {
      commandPaletteMode.set('lines');
    } else if (query.startsWith('@')) {
      commandPaletteMode.set('symbols');
    } else if (!query.startsWith('>') && !query.startsWith(':') && !query.startsWith('@')) {
      commandPaletteMode.set('files');
    }
  }, [query]);

  // Build file results
  const fileResults = useMemo(() => {
    if (!files || mode !== 'files') return [];

    const allFiles: FileResult[] = Object.entries(files)
      .filter(([_, dirent]) => dirent?.type === 'file')
      .map(([path]) => {
        const parts = path.split('/');
        const name = parts.pop() || path;
        const directory = parts.join('/');
        return {
          path,
          name,
          directory,
          isRecent: recentFiles.includes(path),
        };
      });

    if (!query.trim()) {
      // Show recent files first, then all files
      const recent = allFiles.filter(f => f.isRecent).slice(0, 5);
      const others = allFiles.filter(f => !f.isRecent).slice(0, 20);
      return [...recent, ...others];
    }

    // Fuzzy search
    const fuse = new Fuse(allFiles, {
      keys: ['name', 'path'],
      threshold: 0.4,
      includeMatches: true,
    });

    return fuse.search(query, { limit: 25 }).map(r => r.item);
  }, [files, mode, query, recentFiles]);

  // Build command results
  const commandResults = useMemo(() => {
    if (mode !== 'commands') return [];

    const searchQuery = query.startsWith('>') ? query.slice(1).trim() : query;

    if (!searchQuery) {
      return commands;
    }

    const fuse = new Fuse(commands, {
      keys: ['label', 'description', 'category'],
      threshold: 0.4,
    });

    return fuse.search(searchQuery, { limit: 15 }).map(r => r.item);
  }, [commands, mode, query]);

  // Build symbol results from workspace files
  const symbolResults = useMemo(() => {
    if (!files || mode !== 'symbols') return [];

    const symbols: SymbolResult[] = [];

    // Regex patterns for extracting symbols from TS/JS files
    const patterns: Array<{ regex: RegExp; kind: SymbolResult['kind'] }> = [
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: 'function' },
      { regex: /^(?:export\s+)?class\s+(\w+)/gm, kind: 'class' },
      { regex: /^(?:export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
      { regex: /^(?:export\s+)?type\s+(\w+)\s*=/gm, kind: 'type' },
      { regex: /^(?:export\s+)?const\s+(\w+)\s*=/gm, kind: 'variable' },
      { regex: /^(?:export\s+)?(?:default\s+)?function\*?\s+(\w+)/gm, kind: 'function' },
    ];

    const codeExts = /\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h)$/;

    for (const [path, dirent] of Object.entries(files)) {
      if (dirent?.type !== 'file' || !codeExts.test(path)) continue;
      const content = dirent.content;
      if (!content) continue;

      for (const { regex, kind } of patterns) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
          const lineIndex = content.slice(0, match.index).split('\n').length;
          const name = match[1];
          // Skip common non-symbol names
          if (name && name.length > 1 && !/^(if|else|for|while|return|import|from)$/.test(name)) {
            symbols.push({ name, kind, line: lineIndex, file: path });
          }
        }
      }
    }

    const searchQuery = query.startsWith('@') ? query.slice(1).trim() : query;

    if (!searchQuery) {
      return symbols.slice(0, 30);
    }

    const fuse = new Fuse(symbols, {
      keys: ['name', 'file'],
      threshold: 0.4,
    });

    return fuse.search(searchQuery, { limit: 25 }).map(r => r.item);
  }, [files, mode, query]);

  // Get total results
  const results = mode === 'files' ? fileResults : mode === 'commands' ? commandResults : mode === 'symbols' ? symbolResults : [];
  const totalResults = results.length;

  // Handle selection
  const handleSelect = useCallback((index: number) => {
    if (mode === 'files' && fileResults[index]) {
      const file = fileResults[index];
      workbenchStore.setSelectedFile(file.path);
      closeCommandPalette();
    } else if (mode === 'commands' && commandResults[index]) {
      const cmd = commandResults[index];
      closeCommandPalette();
      cmd.action();
    } else if (mode === 'symbols' && symbolResults[index]) {
      const sym = symbolResults[index];
      if (sym.file) {
        workbenchStore.setSelectedFile(sym.file);
        workbenchStore.navigateToLine(sym.file, sym.line);
      }
      closeCommandPalette();
    } else if (mode === 'lines') {
      const lineNum = parseInt(query.slice(1), 10);
      if (!isNaN(lineNum)) {
        const currentFile = workbenchStore.selectedFile.get();
        if (currentFile) {
          workbenchStore.navigateToLine(currentFile, lineNum);
        }
        closeCommandPalette();
      }
    }
  }, [mode, fileResults, commandResults, symbolResults, query]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, totalResults - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        handleSelect(selectedIndex);
        break;
      case 'Tab':
        e.preventDefault();
        // Cycle through modes
        if (mode === 'files') {
          commandPaletteQuery.set('>');
        } else if (mode === 'commands') {
          commandPaletteQuery.set(':');
        } else if (mode === 'lines') {
          commandPaletteQuery.set('@');
        } else {
          commandPaletteQuery.set('');
        }
        break;
    }
  }, [totalResults, selectedIndex, handleSelect, mode]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode]);

  const placeholder = useMemo(() => {
    switch (mode) {
      case 'commands': return 'Type a command...';
      case 'lines': return 'Go to line...';
      case 'symbols': return 'Search symbols...';
      default: return 'Search files...';
    }
  }, [mode]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={closeCommandPalette}
        />

        {/* Palette */}
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className={classNames(
            'relative w-full max-w-2xl mx-4',
            'bg-bolt-elements-background-depth-2 rounded-xl shadow-2xl',
            'border border-bolt-elements-borderColor overflow-hidden',
            className
          )}
        >
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-bolt-elements-borderColor">
            {/* Mode indicator */}
            <div className={classNames(
              'w-6 h-6 rounded flex items-center justify-center text-sm',
              mode === 'commands' && 'bg-purple-500/20 text-purple-400',
              mode === 'files' && 'bg-blue-500/20 text-blue-400',
              mode === 'lines' && 'bg-green-500/20 text-green-400',
              mode === 'symbols' && 'bg-orange-500/20 text-orange-400',
            )}>
              <div className={classNames(
                mode === 'commands' && 'i-ph:command',
                mode === 'files' && 'i-ph:file',
                mode === 'lines' && 'i-ph:hash',
                mode === 'symbols' && 'i-ph:at',
              )} />
            </div>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => commandPaletteQuery.set(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent outline-none text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary text-base"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />

            {/* Keyboard hints */}
            <div className="flex items-center gap-2 text-xs text-bolt-elements-textTertiary">
              <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor">
                Tab
              </kbd>
              <span>switch mode</span>
            </div>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-96 overflow-y-auto">
            {/* Files mode */}
            {mode === 'files' && (
              <>
                {fileResults.length === 0 && query && (
                  <div className="px-4 py-8 text-center text-bolt-elements-textTertiary">
                    No files found
                  </div>
                )}
                {fileResults.length === 0 && !query && (
                  <div className="px-4 py-8 text-center text-bolt-elements-textTertiary">
                    Type to search files
                  </div>
                )}
                {fileResults.map((file, index) => (
                  <button
                    key={file.path}
                    onClick={() => handleSelect(index)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={classNames(
                      'w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors',
                      index === selectedIndex
                        ? 'bg-blue-500/20'
                        : 'hover:bg-bolt-elements-background-depth-3'
                    )}
                  >
                    <div className={classNames('text-lg', getFileIcon(file.name))} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-bolt-elements-textPrimary truncate">
                          {file.name}
                        </span>
                        {file.isRecent && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded">
                            recent
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-bolt-elements-textTertiary truncate">
                        {file.directory}
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}

            {/* Commands mode */}
            {mode === 'commands' && (
              <>
                {commandResults.length === 0 && (
                  <div className="px-4 py-8 text-center text-bolt-elements-textTertiary">
                    No commands found
                  </div>
                )}
                {commandResults.map((cmd, index) => (
                  <button
                    key={cmd.id}
                    onClick={() => handleSelect(index)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={classNames(
                      'w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors',
                      index === selectedIndex
                        ? 'bg-blue-500/20'
                        : 'hover:bg-bolt-elements-background-depth-3'
                    )}
                  >
                    {cmd.icon && (
                      <div className={classNames('text-lg text-bolt-elements-textTertiary', cmd.icon)} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {cmd.category && (
                          <span className="text-xs text-bolt-elements-textTertiary">
                            {cmd.category}:
                          </span>
                        )}
                        <span className="text-sm text-bolt-elements-textPrimary">
                          {cmd.label}
                        </span>
                      </div>
                      {cmd.description && (
                        <div className="text-xs text-bolt-elements-textTertiary truncate">
                          {cmd.description}
                        </div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd className="px-1.5 py-0.5 text-xs bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor text-bolt-elements-textTertiary">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                ))}
              </>
            )}

            {/* Line mode */}
            {mode === 'lines' && (
              <div className="px-4 py-8 text-center">
                <div className="text-bolt-elements-textTertiary mb-2">
                  Go to line
                </div>
                <div className="text-3xl font-mono text-bolt-elements-textPrimary">
                  {query.slice(1) || '1'}
                </div>
                <div className="text-xs text-bolt-elements-textTertiary mt-2">
                  Press Enter to navigate
                </div>
              </div>
            )}

            {/* Symbols mode */}
            {mode === 'symbols' && (
              <>
                {symbolResults.length === 0 ? (
                  <div className="px-4 py-8 text-center text-bolt-elements-textTertiary">
                    {query.length > 1 ? 'No symbols found' : 'Type to search symbols...'}
                  </div>
                ) : (
                  symbolResults.map((sym, index) => {
                    const kindIcons: Record<string, string> = {
                      function: 'i-ph:function',
                      class: 'i-ph:cube',
                      interface: 'i-ph:puzzle-piece',
                      type: 'i-ph:tag',
                      variable: 'i-ph:equals',
                      constant: 'i-ph:hash',
                      method: 'i-ph:gear',
                      property: 'i-ph:dot',
                    };
                    const kindColors: Record<string, string> = {
                      function: 'text-yellow-500',
                      class: 'text-blue-500',
                      interface: 'text-purple-500',
                      type: 'text-green-500',
                      variable: 'text-cyan-500',
                      constant: 'text-orange-500',
                      method: 'text-yellow-500',
                      property: 'text-gray-500',
                    };
                    return (
                      <button
                        key={`${sym.file}:${sym.name}:${sym.line}`}
                        className={classNames(
                          'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                          index === selectedIndex
                            ? 'bg-purple-500/20 text-bolt-elements-textPrimary'
                            : 'hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
                        )}
                        onClick={() => handleSelect(index)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <span className={classNames(kindIcons[sym.kind] || 'i-ph:code', kindColors[sym.kind] || 'text-gray-500', 'text-lg shrink-0')} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm truncate">{sym.name}</span>
                            <span className="text-xs text-bolt-elements-textTertiary">{sym.kind}</span>
                          </div>
                          {sym.file && (
                            <div className="text-xs text-bolt-elements-textTertiary truncate">
                              {sym.file}:{sym.line}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            <div className="flex items-center justify-between text-xs text-bolt-elements-textTertiary">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor">
                    ↑↓
                  </kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor">
                    Enter
                  </kbd>
                  Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor">
                    Esc
                  </kbd>
                  Close
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">
                  &gt;
                </span>
                <span>commands</span>
                <span className="px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">
                  :
                </span>
                <span>line</span>
                <span className="px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">
                  @
                </span>
                <span>symbols</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
});

CommandPalette.displayName = 'CommandPalette';

export default CommandPalette;
