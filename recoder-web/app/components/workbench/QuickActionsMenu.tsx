/**
 * Quick Actions Menu Component
 *
 * A floating action button (FAB) with an expandable menu for common operations.
 * Supports keyboard shortcut (Cmd+.) to toggle the menu.
 *
 * Features:
 * - Floating action button in corner of workbench
 * - Expandable menu with categorized actions
 * - Recently used actions section
 * - Context-aware action visibility
 * - Customizable position
 * - Keyboard navigation
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  quickActionsState,
  quickActionsRegistry,
  quickActionsContext,
  recentQuickActions,
  openQuickActions,
  closeQuickActions,
  toggleQuickActions,
  executeQuickAction,
  registerQuickActions,
  getAvailableQuickActions,
  getRecentQuickActions,
  getQuickActionsByCategory,
  CATEGORY_INFO,
  type QuickAction,
  type QuickActionCategory,
} from '~/lib/stores/quick-actions';
import { workbenchStore } from '~/lib/stores/workbench';
import { openExportModal } from '~/lib/stores/export';
import { classNames } from '~/utils/classNames';

// =============================================================================
// Default Actions Registration
// =============================================================================

/**
 * Register default quick actions
 * Called on component mount
 */
function registerDefaultActions() {
  const defaultActions: QuickAction[] = [
    // File Actions
    {
      id: 'quick-new-file',
      label: 'New File',
      description: 'Create a new file in the project',
      category: 'file',
      icon: 'i-ph:file-plus',
      shortcutHint: 'N',
      action: () => {
        // Trigger new file creation - dispatch event for file tree
        window.dispatchEvent(new CustomEvent('recoder:new-file'));
      },
    },
    // Terminal Actions
    {
      id: 'quick-run-command',
      label: 'Run Command',
      description: 'Open terminal and run a command',
      category: 'terminal',
      icon: 'i-ph:terminal',
      shortcutHint: 'T',
      action: () => {
        workbenchStore.toggleTerminal(true);
        toast.info('Terminal opened - enter your command');
      },
    },
    {
      id: 'quick-open-terminal',
      label: 'Open Terminal',
      description: 'Toggle the terminal panel',
      category: 'terminal',
      icon: 'i-ph:terminal-window',
      action: () => {
        workbenchStore.toggleTerminal();
      },
    },
    // View Actions
    {
      id: 'quick-toggle-preview',
      label: 'Toggle Preview',
      description: 'Switch between code and preview view',
      category: 'view',
      icon: 'i-ph:eye',
      shortcutHint: 'P',
      action: () => {
        const currentView = workbenchStore.currentView.get();
        workbenchStore.currentView.set(currentView === 'code' ? 'preview' : 'code');
      },
    },
    {
      id: 'quick-refresh-preview',
      label: 'Refresh Preview',
      description: 'Reload the preview pane',
      category: 'view',
      icon: 'i-ph:arrow-clockwise',
      action: () => {
        window.dispatchEvent(new CustomEvent('recoder:refresh-preview'));
        toast.success('Preview refreshed');
      },
    },
    // Project Actions
    {
      id: 'quick-export-project',
      label: 'Export Project',
      description: 'Download project as ZIP',
      category: 'project',
      icon: 'i-ph:export',
      shortcutHint: 'E',
      action: () => {
        openExportModal();
      },
    },
    {
      id: 'quick-save-all',
      label: 'Save All Files',
      description: 'Save all unsaved files',
      category: 'project',
      icon: 'i-ph:floppy-disk',
      action: async () => {
        await workbenchStore.saveAllFiles();
        toast.success('All files saved');
      },
    },
    // AI Actions
    {
      id: 'quick-ai-explain',
      label: 'Explain This File',
      description: 'Ask AI to explain the current file',
      category: 'ai',
      icon: 'i-ph:lightbulb',
      isAI: true,
      action: () => {
        const selectedFile = workbenchStore.selectedFile.get();
        if (selectedFile) {
          const message = `Explain this file: ${selectedFile}`;
          window.dispatchEvent(new CustomEvent('recoder:send-chat', { detail: { message } }));
        } else {
          toast.warning('No file selected');
        }
      },
      when: () => !!workbenchStore.selectedFile.get(),
    },
    {
      id: 'quick-ai-fix-errors',
      label: 'Fix Errors',
      description: 'Ask AI to fix errors in current file',
      category: 'ai',
      icon: 'i-ph:bug',
      isAI: true,
      action: () => {
        const selectedFile = workbenchStore.selectedFile.get();
        if (selectedFile) {
          const message = `Fix any errors in: ${selectedFile}`;
          window.dispatchEvent(new CustomEvent('recoder:send-chat', { detail: { message } }));
        } else {
          toast.warning('No file selected');
        }
      },
      when: () => !!workbenchStore.selectedFile.get(),
    },
    {
      id: 'quick-ai-add-comments',
      label: 'Add Comments',
      description: 'Ask AI to add comments to current file',
      category: 'ai',
      icon: 'i-ph:chat-text',
      isAI: true,
      action: () => {
        const selectedFile = workbenchStore.selectedFile.get();
        if (selectedFile) {
          const message = `Add helpful comments to: ${selectedFile}`;
          window.dispatchEvent(new CustomEvent('recoder:send-chat', { detail: { message } }));
        } else {
          toast.warning('No file selected');
        }
      },
      when: () => !!workbenchStore.selectedFile.get(),
    },
    {
      id: 'quick-ai-improve',
      label: 'Improve Code',
      description: 'Ask AI to improve the current file',
      category: 'ai',
      icon: 'i-ph:magic-wand',
      isAI: true,
      action: () => {
        const selectedFile = workbenchStore.selectedFile.get();
        if (selectedFile) {
          const message = `Improve the code quality in: ${selectedFile}`;
          window.dispatchEvent(new CustomEvent('recoder:send-chat', { detail: { message } }));
        } else {
          toast.warning('No file selected');
        }
      },
      when: () => !!workbenchStore.selectedFile.get(),
    },
  ];

  registerQuickActions(defaultActions);
}

// =============================================================================
// Components
// =============================================================================

interface QuickActionsMenuProps {
  className?: string;
}

/**
 * Quick Actions Menu with FAB
 */
export const QuickActionsMenu = memo(({ className }: QuickActionsMenuProps) => {
  const state = useStore(quickActionsState);
  const context = useStore(quickActionsContext);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const menuRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Register default actions on mount
  useEffect(() => {
    registerDefaultActions();
  }, []);

  // Update context when selected file changes
  useEffect(() => {
    if (selectedFile) {
      const ext = selectedFile.split('.').pop()?.toLowerCase() || null;
      quickActionsContext.setKey('hasFile', true);
      quickActionsContext.setKey('fileExtension', ext);
    } else {
      quickActionsContext.setKey('hasFile', false);
      quickActionsContext.setKey('fileExtension', null);
    }
  }, [selectedFile]);

  // Keyboard shortcut handler (Cmd+.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+. (Mac) or Ctrl+. (Windows) to toggle menu
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        toggleQuickActions();
        return;
      }

      // Escape to close
      if (e.key === 'Escape' && state.isOpen) {
        e.preventDefault();
        closeQuickActions();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        state.isOpen &&
        menuRef.current &&
        fabRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !fabRef.current.contains(e.target as Node)
      ) {
        closeQuickActions();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [state.isOpen]);

  // Get filtered actions
  const availableActions = getAvailableQuickActions();
  const recentActions = getRecentQuickActions();
  const actionsByCategory = getQuickActionsByCategory();

  // Filter by search query
  const filteredActions = searchQuery
    ? availableActions.filter(
        (action) =>
          action.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          action.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  // Handle action execution
  const handleActionClick = useCallback((actionId: string) => {
    executeQuickAction(actionId);
    setSearchQuery('');
    setSelectedIndex(0);
  }, []);

  // Handle keyboard navigation in menu
  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const actions = filteredActions || availableActions;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % actions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + actions.length) % actions.length);
      } else if (e.key === 'Enter' && actions[selectedIndex]) {
        e.preventDefault();
        handleActionClick(actions[selectedIndex].id);
      }
    },
    [filteredActions, availableActions, selectedIndex, handleActionClick]
  );

  // Position styles based on settings
  const positionStyles = {
    [state.position.horizontal]: state.position.offset,
    [state.position.vertical]: state.position.offset,
  };

  if (!state.isFabVisible) {
    return null;
  }

  return (
    <div
      className={classNames('fixed z-50', className)}
      style={positionStyles}
    >
      {/* FAB Button */}
      <motion.button
        ref={fabRef}
        onClick={toggleQuickActions}
        className={classNames(
          'w-12 h-12 rounded-full shadow-lg flex items-center justify-center',
          'bg-gradient-to-br from-purple-600 to-purple-700',
          'hover:from-purple-500 hover:to-purple-600',
          'text-white transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-recoder-elements-background-depth-1',
          state.isOpen && 'rotate-45'
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Quick Actions (Cmd+.)"
      >
        <div className="i-ph:plus text-2xl" />
      </motion.button>

      {/* Menu */}
      <AnimatePresence>
        {state.isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={classNames(
              'absolute w-72 max-h-96 overflow-hidden',
              'bg-recoder-elements-background-depth-2 rounded-lg shadow-xl',
              'border border-recoder-elements-borderColor',
              state.position.vertical === 'bottom' ? 'bottom-14 mb-2' : 'top-14 mt-2',
              state.position.horizontal === 'right' ? 'right-0' : 'left-0'
            )}
            onKeyDown={handleMenuKeyDown}
          >
            {/* Search Input */}
            <div className="p-2 border-b border-recoder-elements-borderColor">
              <div className="relative">
                <div className="i-ph:magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-recoder-elements-textSecondary" />
                <input
                  type="text"
                  placeholder="Search actions..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  autoFocus
                  className={classNames(
                    'w-full pl-8 pr-3 py-1.5 text-sm',
                    'bg-recoder-elements-background-depth-3 rounded-md',
                    'text-recoder-elements-textPrimary placeholder:text-recoder-elements-textSecondary',
                    'border border-transparent focus:border-purple-500 focus:outline-none',
                    'transition-colors'
                  )}
                />
              </div>
            </div>

            {/* Actions List */}
            <div className="overflow-y-auto max-h-72">
              {/* Search Results */}
              {filteredActions && (
                <div className="py-1">
                  {filteredActions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-recoder-elements-textSecondary">
                      No matching actions
                    </div>
                  ) : (
                    filteredActions.map((action, index) => (
                      <ActionItem
                        key={action.id}
                        action={action}
                        isSelected={index === selectedIndex}
                        onClick={() => handleActionClick(action.id)}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Default View (Recent + Categories) */}
              {!filteredActions && (
                <>
                  {/* Recent Actions */}
                  {recentActions.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1.5 text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wide">
                        Recent
                      </div>
                      {recentActions.map((action) => (
                        <ActionItem
                          key={`recent-${action.id}`}
                          action={action}
                          onClick={() => handleActionClick(action.id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Categorized Actions */}
                  {(Object.keys(actionsByCategory) as QuickActionCategory[]).map((category) => {
                    const actions = actionsByCategory[category];
                    if (actions.length === 0) return null;

                    return (
                      <div key={category} className="py-1 border-t border-recoder-elements-borderColor first:border-t-0">
                        <div className="px-3 py-1.5 text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wide flex items-center gap-1.5">
                          <div className={CATEGORY_INFO[category].icon} />
                          {CATEGORY_INFO[category].label}
                        </div>
                        {actions.map((action) => (
                          <ActionItem
                            key={action.id}
                            action={action}
                            onClick={() => handleActionClick(action.id)}
                          />
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Footer with keyboard hint */}
            <div className="px-3 py-2 border-t border-recoder-elements-borderColor bg-recoder-elements-background-depth-3">
              <div className="flex items-center justify-between text-xs text-recoder-elements-textSecondary">
                <span>Press Cmd+. to toggle</span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-recoder-elements-background-depth-1 rounded text-xs">Esc</kbd>
                  to close
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// =============================================================================
// Action Item Component
// =============================================================================

interface ActionItemProps {
  action: QuickAction;
  isSelected?: boolean;
  onClick: () => void;
}

const ActionItem = memo(({ action, isSelected, onClick }: ActionItemProps) => {
  return (
    <button
      onClick={onClick}
      className={classNames(
        'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
        'hover:bg-recoder-elements-background-depth-3',
        isSelected && 'bg-recoder-elements-background-depth-3',
        action.isAI && 'text-purple-400'
      )}
    >
      {/* Icon */}
      <div
        className={classNames(
          'text-lg shrink-0',
          action.icon,
          action.isAI ? 'text-purple-400' : 'text-recoder-elements-textSecondary'
        )}
      />

      {/* Label & Description */}
      <div className="flex-1 min-w-0">
        <div className={classNames(
          'text-sm font-medium truncate',
          action.isAI ? 'text-purple-400' : 'text-recoder-elements-textPrimary'
        )}>
          {action.label}
        </div>
        {action.description && (
          <div className="text-xs text-recoder-elements-textSecondary truncate">
            {action.description}
          </div>
        )}
      </div>

      {/* Shortcut Hint */}
      {action.shortcutHint && (
        <kbd className="px-1.5 py-0.5 bg-recoder-elements-background-depth-1 rounded text-xs text-recoder-elements-textSecondary shrink-0">
          {action.shortcutHint}
        </kbd>
      )}

      {/* AI Badge */}
      {action.isAI && (
        <div className="i-ph:robot text-purple-400 text-sm shrink-0" title="AI Action" />
      )}
    </button>
  );
});
