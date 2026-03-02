/**
 * Command Palette Component
 *
 * VS Code-style command palette that opens with Cmd+Shift+P (Mac) / Ctrl+Shift+P (Windows).
 * Features:
 * - Search input at top
 * - Category filters
 * - Keyboard navigation (arrow keys, enter)
 * - Keyboard shortcuts displayed next to commands
 * - Recently used commands at top
 */

import { memo, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import {
  commandPaletteOpen,
  commandPaletteQuery,
  closeCommandPalette,
  getAllCommands,
  getRecentCommands,
  searchCommands,
  executeCommand,
  CATEGORY_INFO,
  type PaletteCommand,
  type CommandCategory,
} from '~/lib/stores/command-palette';

// Category filter options
const CATEGORIES: { id: CommandCategory | 'all' | 'recent'; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: 'i-ph:list' },
  { id: 'recent', label: 'Recent', icon: 'i-ph:clock' },
  { id: 'file', label: 'File', icon: 'i-ph:file' },
  { id: 'edit', label: 'Edit', icon: 'i-ph:pencil-simple' },
  { id: 'view', label: 'View', icon: 'i-ph:eye' },
  { id: 'project', label: 'Project', icon: 'i-ph:folder-notch' },
  { id: 'ai', label: 'AI', icon: 'i-ph:robot' },
  { id: 'help', label: 'Help', icon: 'i-ph:question' },
];

// Detect platform
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

/**
 * Format keyboard shortcut for display
 */
function formatShortcut(shortcut: { mac: string[]; win: string[] } | undefined): string | null {
  if (!shortcut) return null;
  const keys = isMac ? shortcut.mac : shortcut.win;
  return keys.join('+');
}

/**
 * Render keyboard shortcut badge
 */
const ShortcutBadge = memo(({ shortcut }: { shortcut: { mac: string[]; win: string[] } | undefined }) => {
  const formatted = formatShortcut(shortcut);
  if (!formatted) return null;

  const keys = isMac ? shortcut!.mac : shortcut!.win;

  return (
    <div className="flex items-center gap-0.5">
      {keys.map((key, index) => (
        <span key={index} className="flex items-center">
          <kbd className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-medium rounded bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary border border-recoder-elements-borderColor">
            {key}
          </kbd>
          {index < keys.length - 1 && (
            <span className="text-recoder-elements-textTertiary mx-0.5 text-[10px]">+</span>
          )}
        </span>
      ))}
    </div>
  );
});

ShortcutBadge.displayName = 'ShortcutBadge';

/**
 * Command item component
 */
const CommandItem = memo(
  ({
    command,
    isSelected,
    onSelect,
    onHover,
  }: {
    command: PaletteCommand;
    isSelected: boolean;
    onSelect: () => void;
    onHover: () => void;
  }) => {
    const categoryInfo = CATEGORY_INFO[command.category];

    return (
      <button
        className={classNames(
          'w-full flex items-center gap-3 px-4 py-2.5 text-left',
          'transition-colors duration-75',
          isSelected
            ? 'bg-recoder-elements-item-backgroundAccent'
            : 'hover:bg-recoder-elements-item-backgroundHover'
        )}
        onClick={onSelect}
        onMouseEnter={onHover}
      >
        {/* Icon */}
        <div
          className={classNames(
            'flex items-center justify-center w-8 h-8 rounded-md shrink-0',
            'bg-recoder-elements-background-depth-3'
          )}
        >
          <div className={classNames(command.icon || categoryInfo.icon, 'text-lg text-recoder-elements-textSecondary')} />
        </div>

        {/* Label and description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-recoder-elements-textPrimary truncate">
              {command.label}
            </span>
            <span className="text-[10px] text-recoder-elements-textTertiary uppercase tracking-wide shrink-0">
              {categoryInfo.label}
            </span>
          </div>
          {command.description && (
            <p className="text-xs text-recoder-elements-textTertiary truncate mt-0.5">
              {command.description}
            </p>
          )}
        </div>

        {/* Shortcut */}
        <ShortcutBadge shortcut={command.shortcut} />
      </button>
    );
  }
);

CommandItem.displayName = 'CommandItem';

/**
 * Main Command Palette component
 */
export const CommandPalette = memo(() => {
  const isOpen = useStore(commandPaletteOpen);
  const query = useStore(commandPaletteQuery);

  const [selectedCategory, setSelectedCategory] = useState<CommandCategory | 'all' | 'recent'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get filtered commands
  const filteredCommands = useMemo(() => {
    let commands: PaletteCommand[];

    if (selectedCategory === 'recent') {
      commands = getRecentCommands();
    } else if (selectedCategory === 'all') {
      commands = query ? searchCommands(query) : getAllCommands();
    } else {
      const allCommands = query ? searchCommands(query) : getAllCommands();
      commands = allCommands.filter((c) => c.category === selectedCategory);
    }

    // Sort: recent first (if showing all), then alphabetically
    if (selectedCategory === 'all' && !query) {
      const recent = getRecentCommands();
      const recentIds = new Set(recent.map((r) => r.id));
      const nonRecent = commands.filter((c) => !recentIds.has(c.id));
      return [...recent, ...nonRecent];
    }

    return commands;
  }, [query, selectedCategory]);

  // Reset selection when commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length, query, selectedCategory]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      commandPaletteQuery.set('');
      setSelectedCategory('all');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;

    const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;

        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex].id);
          }
          break;

        case 'Escape':
          e.preventDefault();
          closeCommandPalette();
          break;

        case 'Tab':
          e.preventDefault();
          // Cycle through categories
          const currentCategoryIndex = CATEGORIES.findIndex((c) => c.id === selectedCategory);
          const nextCategoryIndex = e.shiftKey
            ? (currentCategoryIndex - 1 + CATEGORIES.length) % CATEGORIES.length
            : (currentCategoryIndex + 1) % CATEGORIES.length;
          setSelectedCategory(CATEGORIES[nextCategoryIndex].id as CommandCategory | 'all' | 'recent');
          break;
      }
    },
    [filteredCommands, selectedIndex, selectedCategory]
  );

  // Global keyboard shortcut handler
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows)
      const isMacShortcut = e.metaKey && e.shiftKey && e.key.toLowerCase() === 'p';
      const isWinShortcut = e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p';

      if (isMacShortcut || isWinShortcut) {
        e.preventDefault();
        if (isOpen) {
          closeCommandPalette();
        } else {
          commandPaletteOpen.set(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]"
      onClick={closeCommandPalette}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={classNames(
          'relative w-full max-w-2xl mx-4',
          'bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor',
          'rounded-xl shadow-2xl overflow-hidden'
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header with search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-recoder-elements-borderColor">
          <div className="i-ph:magnifying-glass text-lg text-recoder-elements-textTertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => commandPaletteQuery.set(e.target.value)}
            placeholder="Type a command or search..."
            className={classNames(
              'flex-1 bg-transparent',
              'text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary',
              'focus:outline-none text-sm'
            )}
          />
          <div className="flex items-center gap-2 text-xs text-recoder-elements-textTertiary">
            <kbd className="px-1.5 py-0.5 font-mono bg-recoder-elements-background-depth-3 rounded border border-recoder-elements-borderColor">
              {isMac ? 'Cmd' : 'Ctrl'}+Shift+P
            </kbd>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-recoder-elements-borderColor overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id as CommandCategory | 'all' | 'recent')}
              className={classNames(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap',
                'transition-colors duration-100',
                selectedCategory === category.id
                  ? 'bg-recoder-elements-item-backgroundAccent text-recoder-elements-textPrimary'
                  : 'text-recoder-elements-textSecondary hover:bg-recoder-elements-item-backgroundHover'
              )}
            >
              <div className={classNames(category.icon, 'text-sm')} />
              {category.label}
            </button>
          ))}
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-12 text-center text-recoder-elements-textTertiary">
              <div className="i-ph:magnifying-glass text-4xl mx-auto mb-3 opacity-50" />
              <p className="text-sm">No commands found</p>
              <p className="text-xs mt-1 opacity-75">Try a different search or category</p>
            </div>
          ) : (
            <>
              {/* Recently Used section header when showing 'all' with recent commands */}
              {selectedCategory === 'all' && !query && getRecentCommands().length > 0 && (
                <div className="px-4 py-2 text-xs font-medium text-recoder-elements-textTertiary uppercase tracking-wide bg-recoder-elements-background-depth-2 border-b border-recoder-elements-borderColor flex items-center gap-2">
                  <div className="i-ph:clock text-sm" />
                  Recently Used
                </div>
              )}
              {filteredCommands.map((command, index) => {
                const recentCommands = getRecentCommands();
                const recentIds = new Set(recentCommands.map((r) => r.id));
                const isFirstNonRecent =
                  selectedCategory === 'all' &&
                  !query &&
                  recentCommands.length > 0 &&
                  index === recentCommands.length &&
                  !recentIds.has(command.id);

                return (
                  <div key={command.id}>
                    {/* All Commands section header */}
                    {isFirstNonRecent && (
                      <div className="px-4 py-2 text-xs font-medium text-recoder-elements-textTertiary uppercase tracking-wide bg-recoder-elements-background-depth-2 border-b border-recoder-elements-borderColor flex items-center gap-2 mt-2">
                        <div className="i-ph:list text-sm" />
                        All Commands
                      </div>
                    )}
                    <CommandItem
                      command={command}
                      isSelected={index === selectedIndex}
                      onSelect={() => executeCommand(command.id)}
                      onHover={() => setSelectedIndex(index)}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 text-xs text-recoder-elements-textTertiary">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 font-mono bg-recoder-elements-background-depth-3 rounded border border-recoder-elements-borderColor">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 font-mono bg-recoder-elements-background-depth-3 rounded border border-recoder-elements-borderColor">
                Enter
              </kbd>
              Execute
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 font-mono bg-recoder-elements-background-depth-3 rounded border border-recoder-elements-borderColor">
                Tab
              </kbd>
              Category
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 font-mono bg-recoder-elements-background-depth-3 rounded border border-recoder-elements-borderColor">
                Esc
              </kbd>
              Close
            </span>
          </div>
          <span>{filteredCommands.length} commands</span>
        </div>
      </div>
    </div>,
    document.body
  );
});

CommandPalette.displayName = 'CommandPalette';

export default CommandPalette;
