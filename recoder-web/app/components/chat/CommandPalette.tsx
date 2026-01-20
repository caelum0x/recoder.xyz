/**
 * Command Palette
 *
 * A modal dialog for browsing and executing commands.
 * Triggered by Ctrl+Shift+P keyboard shortcut.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '~/utils/classNames';
import { type Command, getAllCommands, getRecentCommands, type CommandCategory } from '~/lib/stores/commands';
import { fuzzyMatchCommands, getCategoryColor, getCategoryIcon } from '~/lib/utils/slash-commands';

interface CommandPaletteProps {
  /** Whether the palette is open */
  isOpen: boolean;
  /** Called when the palette should close */
  onClose: () => void;
  /** Called when a command is selected */
  onSelect: (command: Command) => void;
}

const CATEGORIES: { id: CommandCategory | 'all' | 'recent'; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: 'i-ph-list' },
  { id: 'recent', label: 'Recent', icon: 'i-ph-clock' },
  { id: 'test', label: 'Test', icon: 'i-ph-test-tube' },
  { id: 'build', label: 'Build', icon: 'i-ph-hammer' },
  { id: 'lint', label: 'Lint', icon: 'i-ph-magnifying-glass' },
  { id: 'deploy', label: 'Deploy', icon: 'i-ph-rocket-launch' },
  { id: 'custom', label: 'Custom', icon: 'i-ph-star' },
];

export function CommandPalette({ isOpen, onClose, onSelect }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory | 'all' | 'recent'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get filtered commands
  const filteredCommands = useMemo(() => {
    let commands: Command[];

    if (selectedCategory === 'recent') {
      commands = getRecentCommands(10);
    } else if (selectedCategory === 'all') {
      commands = getAllCommands();
    } else {
      commands = getAllCommands().filter((c) => c.category === selectedCategory);
    }

    if (search) {
      commands = fuzzyMatchCommands(search, commands);
    }

    return commands;
  }, [search, selectedCategory]);

  // Reset selection when commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedCategory('all');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const selectedItem = list.children[selectedIndex] as HTMLElement;
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
            onSelect(filteredCommands[selectedIndex]);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          // Cycle through categories
          const currentIndex = CATEGORIES.findIndex((c) => c.id === selectedCategory);
          const nextIndex = (currentIndex + 1) % CATEGORIES.length;
          setSelectedCategory(CATEGORIES[nextIndex].id as CommandCategory | 'all' | 'recent');
          break;
      }
    },
    [filteredCommands, selectedIndex, selectedCategory, onSelect, onClose]
  );

  // Global keyboard shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        if (!isOpen) {
          // Parent component should handle opening
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={classNames(
          'relative w-full max-w-2xl',
          'bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor',
          'rounded-xl shadow-2xl overflow-hidden',
          'animate-fade-in'
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bolt-elements-borderColor">
          <div className="i-ph-magnifying-glass text-lg text-bolt-elements-textTertiary" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands..."
            className={classNames(
              'flex-1 bg-transparent',
              'text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary',
              'focus:outline-none'
            )}
          />
          <kbd className="px-2 py-1 text-xs font-mono bg-bolt-elements-background-depth-3 rounded border border-bolt-elements-borderColor text-bolt-elements-textTertiary">
            Tab
          </kbd>
          <span className="text-xs text-bolt-elements-textTertiary">to switch category</span>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-bolt-elements-borderColor overflow-x-auto">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id as CommandCategory | 'all' | 'recent')}
              className={classNames(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap',
                'transition-colors duration-100',
                selectedCategory === category.id
                  ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
                  : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundHover'
              )}
            >
              <div className={classNames(category.icon, 'text-sm')} />
              {category.label}
            </button>
          ))}
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-bolt-elements-textTertiary">
              <div className="i-ph-magnifying-glass text-4xl mx-auto mb-2 opacity-50" />
              <p>No commands found</p>
              <p className="text-xs mt-1">Try a different search or category</p>
            </div>
          ) : (
            filteredCommands.map((command, index) => (
              <button
                key={command.id}
                onClick={() => {
                  onSelect(command);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={classNames(
                  'w-full flex items-center gap-3 px-4 py-3 text-left',
                  'transition-colors duration-100',
                  selectedIndex === index
                    ? 'bg-bolt-elements-item-backgroundActive'
                    : 'hover:bg-bolt-elements-item-backgroundHover'
                )}
              >
                {/* Icon */}
                <div
                  className={classNames(
                    'flex items-center justify-center w-10 h-10 rounded-lg',
                    'bg-bolt-elements-background-depth-3',
                    getCategoryColor(command.category)
                  )}
                >
                  <div className={classNames(command.icon || getCategoryIcon(command.category), 'text-xl')} />
                </div>

                {/* Command info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-bolt-elements-textPrimary">
                      /{command.id}
                    </span>
                    <span className="text-sm text-bolt-elements-textSecondary">
                      {command.name}
                    </span>
                    {command.type !== 'builtin' && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase bg-bolt-elements-background-depth-3 rounded text-bolt-elements-textTertiary">
                        {command.type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-bolt-elements-textTertiary mt-0.5">
                    {command.description}
                  </p>
                </div>

                {/* Shortcut */}
                {command.shortcut && (
                  <kbd className="flex-shrink-0 px-2 py-1 text-xs font-mono bg-bolt-elements-background-depth-3 rounded border border-bolt-elements-borderColor text-bolt-elements-textTertiary">
                    {command.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-bolt-elements-borderColor text-xs text-bolt-elements-textTertiary">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono bg-bolt-elements-background-depth-3 rounded">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono bg-bolt-elements-background-depth-3 rounded">Enter</kbd>
              Execute
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono bg-bolt-elements-background-depth-3 rounded">Esc</kbd>
              Close
            </span>
          </div>
          <span>{filteredCommands.length} commands</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Hook to manage command palette state
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return { isOpen, open, close, toggle };
}
