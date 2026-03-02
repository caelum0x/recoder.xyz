/**
 * KeyboardShortcuts Component
 *
 * Displays and allows customization of keyboard shortcuts.
 * Features:
 * - Display all shortcuts grouped by category
 * - Search/filter shortcuts
 * - Edit/customize shortcuts
 * - Reset to defaults
 */

import { useStore } from '@nanostores/react';
import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { classNames } from '~/utils/classNames';
import {
  shortcutsPanelOpen,
  closeShortcutsPanel,
  shortcutsSearchQuery,
  setShortcutsSearchQuery,
  DEFAULT_SHORTCUTS,
  getShortcutsByCategory,
  getFilteredShortcuts,
  getEffectiveBinding,
  isCustomized,
  isShortcutEnabled,
  setKeyBinding,
  removeKeyBinding,
  resetAllBindings,
  toggleShortcutEnabled,
  getCategoryDisplayInfo,
  type ShortcutDefinition,
  type KeyBinding,
} from '~/lib/stores/keyboard-shortcuts';

// Category order for display
const CATEGORY_ORDER = ['general', 'view', 'editor', 'navigation', 'file', 'terminal', 'chat', 'custom'];

/**
 * Format a key binding for display
 */
function formatKeys(keys: KeyBinding['keys']): string {
  if (!keys || keys.length === 0) return 'Not set';

  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

  return keys.map((k) => {
    const parts: string[] = [];

    if (k.ctrlOrMeta) {
      parts.push(isMac ? 'Cmd' : 'Ctrl');
    } else {
      if (k.ctrl) parts.push('Ctrl');
      if (k.meta) parts.push(isMac ? 'Cmd' : 'Win');
    }

    if (k.alt) parts.push(isMac ? 'Option' : 'Alt');
    if (k.shift) parts.push('Shift');

    // Format the key
    let keyDisplay = k.key.length === 1 ? k.key.toUpperCase() : formatSpecialKey(k.key);
    parts.push(keyDisplay);

    return parts.join('+');
  }).join(' ');
}

/**
 * Format special keys for display
 */
function formatSpecialKey(key: string): string {
  const specialKeys: Record<string, string> = {
    escape: 'Esc',
    arrowup: 'Up',
    arrowdown: 'Down',
    arrowleft: 'Left',
    arrowright: 'Right',
    backspace: 'Backspace',
    delete: 'Delete',
    enter: 'Enter',
    tab: 'Tab',
    space: 'Space',
    ' ': 'Space',
    '`': '`',
    '\\': '\\',
    '/': '/',
    ',': ',',
  };

  return specialKeys[key.toLowerCase()] || key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Main KeyboardShortcuts component
 */
export const KeyboardShortcuts = memo(() => {
  const isOpen = useStore(shortcutsPanelOpen);
  const searchQuery = useStore(shortcutsSearchQuery);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredShortcuts = searchQuery.trim()
    ? getFilteredShortcuts(searchQuery)
    : DEFAULT_SHORTCUTS;

  const groupedShortcuts = getShortcutsByCategory();
  const categoriesToShow = searchQuery.trim()
    ? [...new Set(filteredShortcuts.map(s => s.category))]
    : CATEGORY_ORDER.filter(c => groupedShortcuts[c]?.length > 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={closeShortcutsPanel}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden"
          style={{ backgroundColor: 'var(--recoder-elements-bg-depth-1)', border: '1px solid var(--recoder-elements-bg-depth-2)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--recoder-elements-bg-depth-2)' }}>
            <h2 className="text-lg font-semibold text-recoder-elements-textPrimary flex items-center gap-2">
              <div className="i-ph:keyboard text-xl" />
              Keyboard Shortcuts
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (confirm('Reset all keyboard shortcuts to defaults?')) {
                    resetAllBindings();
                  }
                }}
                className="px-3 py-1.5 text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 rounded-lg transition-colors"
              >
                Reset All
              </button>
              <button
                onClick={closeShortcutsPanel}
                className="p-1.5 rounded-lg text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 transition-colors"
              >
                <div className="i-ph:x text-xl" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="p-4 border-b" style={{ borderColor: 'var(--recoder-elements-bg-depth-2)' }}>
            <div className="relative">
              <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-recoder-elements-textTertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setShortcutsSearchQuery(e.target.value)}
                placeholder="Search shortcuts..."
                className="w-full pl-10 pr-4 py-2 bg-black/40 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary text-sm placeholder:text-recoder-elements-textTertiary focus:outline-none focus:border-amber-500 transition-colors"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setShortcutsSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
                >
                  <div className="i-ph:x text-sm" />
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Category Sidebar */}
            <div className="w-48 border-r flex-shrink-0 py-2 overflow-y-auto" style={{ borderColor: 'var(--recoder-elements-bg-depth-2)' }}>
              <button
                onClick={() => setSelectedCategory(null)}
                className={classNames(
                  'w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left',
                  selectedCategory === null
                    ? 'bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary'
                    : 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-2'
                )}
              >
                <div className="i-ph:list text-lg" />
                All Shortcuts
              </button>
              {categoriesToShow.map((category) => {
                const info = getCategoryDisplayInfo(category);
                const count = searchQuery.trim()
                  ? filteredShortcuts.filter(s => s.category === category).length
                  : groupedShortcuts[category]?.length || 0;

                return (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={classNames(
                      'w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left',
                      selectedCategory === category
                        ? 'bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary'
                        : 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-2'
                    )}
                  >
                    <div className={classNames(info.icon, 'text-lg')} />
                    <span className="flex-1">{info.label}</span>
                    <span className="text-xs text-recoder-elements-textTertiary">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Shortcuts List */}
            <div className="flex-1 overflow-y-auto p-4">
              {categoriesToShow
                .filter(c => selectedCategory === null || c === selectedCategory)
                .map((category) => {
                  const info = getCategoryDisplayInfo(category);
                  const shortcuts = searchQuery.trim()
                    ? filteredShortcuts.filter(s => s.category === category)
                    : groupedShortcuts[category] || [];

                  if (shortcuts.length === 0) return null;

                  return (
                    <div key={category} className="mb-6 last:mb-0">
                      <h3 className="text-sm font-medium text-recoder-elements-textSecondary mb-3 flex items-center gap-2">
                        <div className={classNames(info.icon, 'text-base')} />
                        {info.label}
                      </h3>
                      <div className="space-y-1">
                        {shortcuts.map((shortcut) => (
                          <ShortcutRow
                            key={shortcut.id}
                            shortcut={shortcut}
                            isEditing={editingId === shortcut.id}
                            onStartEdit={() => setEditingId(shortcut.id)}
                            onEndEdit={() => setEditingId(null)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

              {filteredShortcuts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-recoder-elements-textTertiary">
                  <div className="i-ph:magnifying-glass text-4xl mb-3" />
                  <p className="text-sm">No shortcuts found for "{searchQuery}"</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t text-xs text-recoder-elements-textTertiary flex items-center justify-between" style={{ borderColor: 'var(--recoder-elements-bg-depth-2)' }}>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary border border-recoder-elements-borderColor text-xs">Click</kbd>
                to edit
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary border border-recoder-elements-borderColor text-xs">Esc</kbd>
                to cancel
              </span>
            </div>
            <span>
              {DEFAULT_SHORTCUTS.length} shortcuts
            </span>
          </div>
        </div>
      </div>
    </>
  );
});

/**
 * Individual shortcut row component
 */
const ShortcutRow = memo(({
  shortcut,
  isEditing,
  onStartEdit,
  onEndEdit,
}: {
  shortcut: ShortcutDefinition;
  isEditing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
}) => {
  const effectiveKeys = getEffectiveBinding(shortcut.id);
  const customized = isCustomized(shortcut.id);
  const enabled = isShortcutEnabled(shortcut.id);
  const [recordedKeys, setRecordedKeys] = useState<KeyBinding['keys']>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      setRecordedKeys([]);
    }
  }, [isEditing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels editing
    if (e.key === 'Escape') {
      onEndEdit();
      return;
    }

    // Enter saves the binding
    if (e.key === 'Enter' && recordedKeys.length > 0) {
      setKeyBinding(shortcut.id, {
        id: shortcut.id,
        keys: recordedKeys,
        enabled: true,
      });
      onEndEdit();
      return;
    }

    // Backspace clears the recorded keys
    if (e.key === 'Backspace' && recordedKeys.length > 0) {
      setRecordedKeys(prev => prev.slice(0, -1));
      return;
    }

    // Ignore modifier-only presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }

    // Record the key combination
    const newKey: KeyBinding['keys'][0] = {
      key: e.key.toLowerCase(),
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
    };

    // Check if Ctrl and Meta are both pressed (cross-platform binding)
    if (e.ctrlKey && e.metaKey) {
      newKey.ctrlOrMeta = true;
      newKey.ctrl = false;
      newKey.meta = false;
    } else if (e.metaKey && !e.ctrlKey) {
      // On Mac, Cmd without Ctrl
      newKey.ctrlOrMeta = true;
      newKey.meta = false;
    } else if (e.ctrlKey && !e.metaKey) {
      // On Windows/Linux, Ctrl without Meta
      // Keep as ctrl for explicit Ctrl shortcuts
    }

    setRecordedKeys(prev => [...prev, newKey]);
  }, [shortcut.id, recordedKeys, onEndEdit]);

  const handleReset = useCallback(() => {
    removeKeyBinding(shortcut.id);
  }, [shortcut.id]);

  const handleToggle = useCallback(() => {
    toggleShortcutEnabled(shortcut.id);
  }, [shortcut.id]);

  return (
    <div
      className={classNames(
        'flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors group',
        enabled ? 'hover:bg-recoder-elements-background-depth-2' : 'opacity-50',
        isEditing && 'bg-amber-500/10 ring-1 ring-amber-500/50'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={classNames(
            'text-sm',
            enabled ? 'text-recoder-elements-textPrimary' : 'text-recoder-elements-textTertiary'
          )}>
            {shortcut.name}
          </span>
          {customized && (
            <span className="text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
              Custom
            </span>
          )}
        </div>
        <p className="text-xs text-recoder-elements-textTertiary mt-0.5 truncate">
          {shortcut.description}
        </p>
      </div>

      <div className="flex items-center gap-2 ml-4">
        {/* Enable/Disable toggle */}
        <button
          onClick={handleToggle}
          className={classNames(
            'p-1.5 rounded transition-colors opacity-0 group-hover:opacity-100',
            enabled ? 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3' : 'text-amber-500 hover:bg-amber-500/20'
          )}
          title={enabled ? 'Disable shortcut' : 'Enable shortcut'}
        >
          <div className={enabled ? 'i-ph:eye' : 'i-ph:eye-slash'} />
        </button>

        {/* Reset button (if customized) */}
        {customized && (
          <button
            onClick={handleReset}
            className="p-1.5 rounded text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 transition-colors opacity-0 group-hover:opacity-100"
            title="Reset to default"
          >
            <div className="i-ph:arrow-counter-clockwise" />
          </button>
        )}

        {/* Key binding display/edit */}
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              readOnly
              value={recordedKeys.length > 0 ? formatKeys(recordedKeys) : 'Press keys...'}
              onKeyDown={handleKeyDown}
              onBlur={onEndEdit}
              className="w-36 px-3 py-1.5 bg-black/60 border border-amber-500/50 rounded text-recoder-elements-textPrimary text-sm text-center focus:outline-none"
              placeholder="Press keys..."
            />
            {recordedKeys.length > 0 && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setKeyBinding(shortcut.id, {
                    id: shortcut.id,
                    keys: recordedKeys,
                    enabled: true,
                  });
                  onEndEdit();
                }}
                className="p-1.5 rounded bg-amber-500 text-black hover:bg-amber-400 transition-colors"
                title="Save"
              >
                <div className="i-ph:check" />
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={onStartEdit}
            className="flex items-center gap-1 min-w-[120px] justify-end"
          >
            {effectiveKeys.map((k, i) => (
              <span key={i} className="flex items-center">
                {formatKeys([k]).split('+').map((part, j) => (
                  <span key={j}>
                    <kbd className="px-2 py-1 text-xs rounded bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary border border-recoder-elements-borderColor">
                      {part}
                    </kbd>
                    {j < formatKeys([k]).split('+').length - 1 && (
                      <span className="text-recoder-elements-textTertiary mx-0.5">+</span>
                    )}
                  </span>
                ))}
                {i < effectiveKeys.length - 1 && (
                  <span className="text-recoder-elements-textTertiary mx-1"></span>
                )}
              </span>
            ))}
          </button>
        )}
      </div>
    </div>
  );
});

ShortcutRow.displayName = 'ShortcutRow';
KeyboardShortcuts.displayName = 'KeyboardShortcuts';

export default KeyboardShortcuts;
