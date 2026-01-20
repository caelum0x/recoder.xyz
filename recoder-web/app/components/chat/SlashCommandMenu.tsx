/**
 * Slash Command Menu
 *
 * A floating dropdown menu that appears when the user types "/" in the chat input.
 * Shows matching commands with fuzzy search and keyboard navigation.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import type { Command } from '~/lib/stores/commands';
import { getCategoryColor, getCategoryIcon } from '~/lib/utils/slash-commands';

interface SlashCommandMenuProps {
  /** Commands to display */
  commands: Command[];
  /** Called when a command is selected */
  onSelect: (command: Command) => void;
  /** Called when the menu should close */
  onClose: () => void;
  /** Currently highlighted index */
  highlightedIndex?: number;
  /** Position relative to input */
  position?: 'above' | 'below';
}

export function SlashCommandMenu({
  commands,
  onSelect,
  onClose,
  highlightedIndex = 0,
  position = 'above',
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(highlightedIndex);

  // Update selected index when highlighted index changes
  useEffect(() => {
    setSelectedIndex(highlightedIndex);
  }, [highlightedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const selectedItem = menu.children[selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % commands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + commands.length) % commands.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (commands[selectedIndex]) {
            onSelect(commands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          if (commands[selectedIndex]) {
            onSelect(commands[selectedIndex]);
          }
          break;
      }
    },
    [commands, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (commands.length === 0) {
    return (
      <div
        className={classNames(
          'absolute left-0 right-0 z-50',
          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
          'rounded-lg shadow-lg overflow-hidden',
          position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
        )}
      >
        <div className="px-4 py-3 text-sm text-bolt-elements-textTertiary">
          No commands found
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className={classNames(
        'absolute left-0 right-0 z-50',
        'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
        'rounded-lg shadow-lg overflow-hidden',
        'max-h-64 overflow-y-auto',
        position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
      )}
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="py-1">
        {commands.map((command, index) => (
          <button
            key={command.id}
            onClick={() => onSelect(command)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={classNames(
              'w-full flex items-center gap-3 px-4 py-2.5 text-left',
              'transition-colors duration-100',
              selectedIndex === index
                ? 'bg-bolt-elements-item-backgroundActive'
                : 'hover:bg-bolt-elements-item-backgroundHover'
            )}
            role="option"
            aria-selected={selectedIndex === index}
          >
            {/* Icon */}
            <div
              className={classNames(
                'flex items-center justify-center w-8 h-8 rounded-md',
                'bg-bolt-elements-background-depth-3',
                getCategoryColor(command.category)
              )}
            >
              <div className={classNames(command.icon || getCategoryIcon(command.category), 'text-lg')} />
            </div>

            {/* Command info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-orange-400">
                  /{command.id}
                </span>
                <span className="text-xs text-bolt-elements-textSecondary">
                  {command.name}
                </span>
              </div>
              <p className="text-xs text-bolt-elements-textTertiary truncate">
                {command.description}
              </p>
            </div>

            {/* Shortcut */}
            {command.shortcut && (
              <div className="flex-shrink-0">
                <kbd className="px-2 py-1 text-xs font-mono bg-bolt-elements-background-depth-3 rounded border border-bolt-elements-borderColor text-bolt-elements-textTertiary">
                  {command.shortcut}
                </kbd>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Hook to manage slash command menu state
 */
export function useSlashCommandMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const open = useCallback((initialFilter: string = '') => {
    setFilter(initialFilter);
    setHighlightedIndex(0);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setFilter('');
    setHighlightedIndex(0);
  }, []);

  const updateFilter = useCallback((newFilter: string) => {
    setFilter(newFilter);
    setHighlightedIndex(0);
  }, []);

  const moveHighlight = useCallback((direction: 'up' | 'down', maxIndex: number) => {
    setHighlightedIndex((prev) => {
      if (direction === 'down') {
        return (prev + 1) % (maxIndex + 1);
      } else {
        return (prev - 1 + maxIndex + 1) % (maxIndex + 1);
      }
    });
  }, []);

  return {
    isOpen,
    filter,
    highlightedIndex,
    open,
    close,
    updateFilter,
    moveHighlight,
  };
}
