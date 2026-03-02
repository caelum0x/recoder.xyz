import { memo, useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { shortcutsPanelOpen, closeShortcutsPanel } from '~/lib/stores/keyboard-shortcuts';

// Comprehensive keyboard shortcuts organized by category
const ALL_SHORTCUTS = {
  General: [
    {
      id: 'open-settings',
      description: 'Open settings',
      macKeys: ['Cmd', ','],
      winKeys: ['Ctrl', ','],
    },
    {
      id: 'show-shortcuts',
      description: 'Show keyboard shortcuts',
      macKeys: ['Cmd', '/'],
      winKeys: ['Ctrl', '/'],
    },
    {
      id: 'quick-actions',
      description: 'Open quick actions / command palette',
      macKeys: ['Cmd', 'K'],
      winKeys: ['Ctrl', 'K'],
    },
    {
      id: 'cancel-close',
      description: 'Cancel / Close dialog',
      macKeys: ['Esc'],
      winKeys: ['Esc'],
    },
  ],
  Chat: [
    {
      id: 'send-message',
      description: 'Send message',
      macKeys: ['Cmd', 'Enter'],
      winKeys: ['Ctrl', 'Enter'],
    },
    {
      id: 'clear-chat',
      description: 'Clear chat',
      macKeys: ['Cmd', 'L'],
      winKeys: ['Ctrl', 'L'],
    },
    {
      id: 'focus-input',
      description: 'Focus chat input',
      macKeys: ['Cmd', 'I'],
      winKeys: ['Ctrl', 'I'],
    },
    {
      id: 'slash-commands',
      description: 'Slash commands (type in input)',
      macKeys: ['/'],
      winKeys: ['/'],
    },
  ],
  Editor: [
    {
      id: 'save-file',
      description: 'Save file',
      macKeys: ['Cmd', 'S'],
      winKeys: ['Ctrl', 'S'],
    },
    {
      id: 'undo',
      description: 'Undo',
      macKeys: ['Cmd', 'Z'],
      winKeys: ['Ctrl', 'Z'],
    },
    {
      id: 'redo',
      description: 'Redo',
      macKeys: ['Cmd', 'Shift', 'Z'],
      winKeys: ['Ctrl', 'Shift', 'Z'],
    },
    {
      id: 'find-in-file',
      description: 'Find in file',
      macKeys: ['Cmd', 'F'],
      winKeys: ['Ctrl', 'F'],
    },
    {
      id: 'find-and-replace',
      description: 'Find and replace',
      macKeys: ['Cmd', 'H'],
      winKeys: ['Ctrl', 'H'],
    },
    {
      id: 'toggle-comment',
      description: 'Toggle line comment',
      macKeys: ['Cmd', '/'],
      winKeys: ['Ctrl', '/'],
    },
    {
      id: 'select-next-occurrence',
      description: 'Select next occurrence',
      macKeys: ['Cmd', 'D'],
      winKeys: ['Ctrl', 'D'],
    },
    {
      id: 'go-to-line',
      description: 'Go to line',
      macKeys: ['Cmd', 'G'],
      winKeys: ['Ctrl', 'G'],
    },
    {
      id: 'quick-open',
      description: 'Quick open file',
      macKeys: ['Cmd', 'P'],
      winKeys: ['Ctrl', 'P'],
    },
  ],
  Navigation: [
    {
      id: 'toggle-sidebar',
      description: 'Toggle sidebar',
      macKeys: ['Cmd', 'B'],
      winKeys: ['Ctrl', 'B'],
    },
    {
      id: 'toggle-terminal',
      description: 'Toggle terminal',
      macKeys: ['Cmd', '`'],
      winKeys: ['Ctrl', '`'],
    },
    {
      id: 'toggle-terminal-alt',
      description: 'Toggle terminal (alternative)',
      macKeys: ['Cmd', 'J'],
      winKeys: ['Ctrl', 'J'],
    },
    {
      id: 'file-explorer',
      description: 'Show file explorer',
      macKeys: ['Cmd', 'Shift', 'E'],
      winKeys: ['Ctrl', 'Shift', 'E'],
    },
    {
      id: 'search-in-files',
      description: 'Search in files',
      macKeys: ['Cmd', 'Shift', 'F'],
      winKeys: ['Ctrl', 'Shift', 'F'],
    },
    {
      id: 'git-panel',
      description: 'Show Git panel',
      macKeys: ['Cmd', 'Shift', 'G'],
      winKeys: ['Ctrl', 'Shift', 'G'],
    },
  ],
  Terminal: [
    {
      id: 'clear-terminal',
      description: 'Clear terminal',
      macKeys: ['Cmd', 'K'],
      winKeys: ['Ctrl', 'K'],
    },
    {
      id: 'search-history',
      description: 'Search command history',
      macKeys: ['Ctrl', 'R'],
      winKeys: ['Ctrl', 'R'],
    },
    {
      id: 'cancel-command',
      description: 'Cancel current command',
      macKeys: ['Ctrl', 'C'],
      winKeys: ['Ctrl', 'C'],
    },
    {
      id: 'scroll-up',
      description: 'Scroll up in terminal',
      macKeys: ['Shift', 'PageUp'],
      winKeys: ['Shift', 'PageUp'],
    },
    {
      id: 'scroll-down',
      description: 'Scroll down in terminal',
      macKeys: ['Shift', 'PageDown'],
      winKeys: ['Shift', 'PageDown'],
    },
  ],
  Panels: [
    {
      id: 'terminal-tab',
      description: 'Switch to Terminal tab',
      macKeys: ['Cmd', '1'],
      winKeys: ['Ctrl', '1'],
    },
    {
      id: 'logs-tab',
      description: 'Switch to Logs tab',
      macKeys: ['Cmd', '2'],
      winKeys: ['Ctrl', '2'],
    },
    {
      id: 'problems-tab',
      description: 'Switch to Problems tab',
      macKeys: ['Cmd', '3'],
      winKeys: ['Ctrl', '3'],
    },
    {
      id: 'secrets-tab',
      description: 'Switch to Secrets tab',
      macKeys: ['Cmd', '4'],
      winKeys: ['Ctrl', '4'],
    },
  ],
};

type CategoryName = keyof typeof ALL_SHORTCUTS;

const CATEGORY_ICONS: Record<CategoryName, string> = {
  General: 'i-ph:gear',
  Chat: 'i-ph:chat-circle-text',
  Editor: 'i-ph:code',
  Navigation: 'i-ph:compass',
  Terminal: 'i-ph:terminal-window',
  Panels: 'i-ph:squares-four',
};

interface ShortcutKeyProps {
  keys: string[];
}

const ShortcutKey = memo(({ keys }: ShortcutKeyProps) => (
  <div className="flex items-center gap-1">
    {keys.map((key, index) => (
      <span key={index} className="flex items-center">
        <kbd className="inline-flex items-center justify-center min-w-[24px] px-2 py-1 text-xs font-medium rounded bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary border border-recoder-elements-borderColor">
          {key}
        </kbd>
        {index < keys.length - 1 && (
          <span className="text-recoder-elements-textTertiary mx-0.5">+</span>
        )}
      </span>
    ))}
  </div>
));

export const KeyboardShortcutsPanel = memo(() => {
  const isOpen = useStore(shortcutsPanelOpen);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryName | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Detect Mac vs Windows
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset search when panel closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSelectedCategory('all');
    }
  }, [isOpen]);

  // Filter shortcuts based on search query and selected category
  const filteredShortcuts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const categories = selectedCategory === 'all'
      ? (Object.keys(ALL_SHORTCUTS) as CategoryName[])
      : [selectedCategory];

    const result: Record<string, typeof ALL_SHORTCUTS[CategoryName]> = {};

    for (const category of categories) {
      const shortcuts = ALL_SHORTCUTS[category];
      const filtered = shortcuts.filter(shortcut => {
        if (!query) return true;

        const description = shortcut.description.toLowerCase();
        const macKeysStr = shortcut.macKeys.join(' ').toLowerCase();
        const winKeysStr = shortcut.winKeys.join(' ').toLowerCase();

        return description.includes(query) ||
               macKeysStr.includes(query) ||
               winKeysStr.includes(query);
      });

      if (filtered.length > 0) {
        result[category] = filtered;
      }
    }

    return result;
  }, [searchQuery, selectedCategory]);

  const totalShortcuts = useMemo(() => {
    return Object.values(filteredShortcuts).reduce((sum, shortcuts) => sum + shortcuts.length, 0);
  }, [filteredShortcuts]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeShortcutsPanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={closeShortcutsPanel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div
          className="w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-recoder-elements-borderColor">
            <div className="flex items-center gap-3">
              <div className="i-ph:keyboard text-2xl text-recoder-elements-textPrimary" />
              <h2 className="text-lg font-semibold text-recoder-elements-textPrimary">
                Keyboard Shortcuts
              </h2>
            </div>
            <button
              onClick={closeShortcutsPanel}
              className="p-2 rounded-lg text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-2 transition-colors"
              aria-label="Close"
            >
              <div className="i-ph:x text-xl" />
            </button>
          </div>

          {/* Search and Filter Bar */}
          <div className="px-6 py-4 border-b border-recoder-elements-borderColor">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search Input */}
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <div className="i-ph:magnifying-glass text-recoder-elements-textTertiary" />
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search shortcuts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-recoder-elements-background-depth-2"
                    aria-label="Clear search"
                  >
                    <div className="i-ph:x text-recoder-elements-textTertiary text-sm" />
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={classNames(
                    'px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                    selectedCategory === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3'
                  )}
                >
                  All
                </button>
                {(Object.keys(ALL_SHORTCUTS) as CategoryName[]).map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={classNames(
                      'px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
                      selectedCategory === category
                        ? 'bg-blue-600 text-white'
                        : 'bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3'
                    )}
                  >
                    <div className={classNames(CATEGORY_ICONS[category], 'text-base')} />
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {totalShortcuts === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-recoder-elements-textTertiary">
                <div className="i-ph:magnifying-glass text-4xl mb-4" />
                <p className="text-lg">No shortcuts found</p>
                <p className="text-sm mt-1">Try a different search term</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {(Object.entries(filteredShortcuts) as [CategoryName, typeof ALL_SHORTCUTS[CategoryName]][]).map(([category, shortcuts]) => (
                  <div key={category} className="space-y-3">
                    <div className="flex items-center gap-2 sticky top-0 bg-recoder-elements-background-depth-1 py-1">
                      <div className={classNames(CATEGORY_ICONS[category], 'text-lg text-recoder-elements-textSecondary')} />
                      <h3 className="text-sm font-semibold text-recoder-elements-textPrimary uppercase tracking-wide">
                        {category}
                      </h3>
                      <span className="text-xs text-recoder-elements-textTertiary">
                        ({shortcuts.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {shortcuts.map((shortcut) => (
                        <div
                          key={shortcut.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor hover:border-recoder-elements-borderColorActive transition-colors"
                        >
                          <span className="text-sm text-recoder-elements-textSecondary flex-1 mr-4">
                            {shortcut.description}
                          </span>
                          <ShortcutKey keys={isMac ? shortcut.macKeys : shortcut.winKeys} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-recoder-elements-borderColor bg-recoder-elements-background-depth-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-recoder-elements-textTertiary">
                <div className="i-ph:lightbulb text-lg" />
                <span>
                  Showing {isMac ? 'Mac' : 'Windows/Linux'} shortcuts.
                  Press <kbd className="px-1.5 py-0.5 rounded bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary border border-recoder-elements-borderColor text-xs mx-1">Esc</kbd> to close.
                </span>
              </div>
              <button
                onClick={closeShortcutsPanel}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

KeyboardShortcutsPanel.displayName = 'KeyboardShortcutsPanel';
