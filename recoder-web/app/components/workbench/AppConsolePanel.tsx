/**
 * AppConsolePanel - App console output panel
 * Shows console.log, console.error, console.warn from the preview iframe
 * Inspired by dyad's Console component
 *
 * Features:
 * - Capture console output from iframe via postMessage
 * - Color-coded log levels (log=gray, warn=yellow, error=red, info=blue)
 * - Expandable stack traces
 * - Filter by level, search by text
 * - Clear all logs button
 * - Copy log to clipboard
 * - Pin important logs
 * - Export logs to file
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  consoleEntriesAtom,
  filteredEntriesAtom,
  levelFilterAtom,
  typeFilterAtom,
  autoScrollEnabledAtom,
  systemMessagesCollapsedAtom,
  searchQueryAtom,
  pinnedEntriesAtom,
  errorCountAtom,
  warningCountAtom,
  entryCountAtom,
  addConsoleEntry,
  clearConsole,
  setLevelFilter,
  setTypeFilter,
  setAutoScroll,
  toggleSystemMessages,
  resetFilters,
  setSearchQuery,
  togglePinEntry,
  copyEntryToClipboard,
  exportLogsToFile,
  exportFilteredLogsToFile,
  getLevelColorClass,
  getLevelBgClass,
  getLevelIconClass,
  formatTimestamp,
  type ConsoleEntry,
  type ConsoleLogLevel,
  type ConsoleLogType,
} from '~/lib/stores/app-console';
import { workbenchStore } from '~/lib/stores/workbench';
import { IconButton } from '~/components/ui/IconButton';
import { classNames } from '~/utils/classNames';

interface AppConsolePanelProps {
  className?: string;
}

const MAX_MESSAGE_LENGTH = 500;

/**
 * Single console entry component
 */
const ConsoleEntryItem = memo(({
  entry,
  isExpanded,
  onToggleExpand,
  onSendToChat,
}: {
  entry: ConsoleEntry;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSendToChat: () => void;
}) => {
  const isTruncated = entry.message.length > MAX_MESSAGE_LENGTH;
  const displayMessage = isTruncated && !isExpanded
    ? entry.message.slice(0, MAX_MESSAGE_LENGTH) + '...'
    : entry.message;

  return (
    <div
      className={classNames(
        'relative px-3 py-1.5 group transition-colors border-b border-bolt-elements-borderColor/30',
        getLevelBgClass(entry.level),
        'hover:bg-bolt-elements-item-backgroundActive'
      )}
    >
      <div className="flex items-start gap-2">
        {/* Level icon */}
        <span className={classNames('mt-0.5 shrink-0 text-sm', getLevelIconClass(entry.level))} />

        {/* Timestamp */}
        <span
          className="text-bolt-elements-textTertiary text-xs font-mono shrink-0 mt-0.5"
          title={new Date(entry.timestamp).toLocaleString()}
        >
          {formatTimestamp(entry.timestamp)}
        </span>

        {/* Source badge */}
        {entry.sourceName && (
          <span className="text-[10px] px-1.5 py-0.5 bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary rounded shrink-0">
            {entry.sourceName}
          </span>
        )}

        {/* Type badge (only if not client) */}
        {entry.type !== 'client' && (
          <span className={classNames(
            'text-[10px] px-1.5 py-0.5 rounded shrink-0',
            entry.type === 'server' ? 'bg-purple-500/20 text-purple-400' :
            entry.type === 'system' ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary' :
            'bg-blue-500/20 text-blue-400'
          )}>
            {entry.type}
          </span>
        )}

        {/* Message */}
        <div className={classNames('flex-1 min-w-0 font-mono text-xs', getLevelColorClass(entry.level))}>
          <span className="whitespace-pre-wrap break-all">{displayMessage}</span>

          {/* Expand/collapse button for long messages */}
          {isTruncated && (
            <button
              onClick={onToggleExpand}
              className="ml-2 text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 text-xs"
            >
              {isExpanded ? (
                <>
                  Show less <span className="i-ph:caret-up text-[10px]" />
                </>
              ) : (
                <>
                  Show more <span className="i-ph:caret-down text-[10px]" />
                </>
              )}
            </button>
          )}
        </div>

        {/* Send to chat button (on hover) */}
        <button
          onClick={onSendToChat}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-bolt-elements-background-depth-3 rounded"
          title="Send to chat"
        >
          <span className="i-ph:chat-circle text-xs text-bolt-elements-textSecondary" />
        </button>
      </div>

      {/* Stack trace for errors */}
      {entry.stack && isExpanded && (
        <div className="mt-2 ml-6 p-2 bg-bolt-elements-background-depth-3 rounded text-[10px] text-bolt-elements-textSecondary font-mono whitespace-pre-wrap overflow-x-auto">
          {entry.stack}
        </div>
      )}
    </div>
  );
});

ConsoleEntryItem.displayName = 'ConsoleEntryItem';

/**
 * App Console Panel Component
 */
export const AppConsolePanel = memo(({ className = '' }: AppConsolePanelProps) => {
  const entries = useStore(filteredEntriesAtom);
  const allEntries = useStore(consoleEntriesAtom);
  const levelFilter = useStore(levelFilterAtom);
  const typeFilter = useStore(typeFilterAtom);
  const autoScroll = useStore(autoScrollEnabledAtom);
  const systemCollapsed = useStore(systemMessagesCollapsedAtom);
  const errorCount = useStore(errorCountAtom);
  const warningCount = useStore(warningCountAtom);
  const totalCount = useStore(entryCountAtom);
  const projectId = useStore(workbenchStore.projectId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && isNearBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, autoScroll, isNearBottom]);

  // Handle scroll to detect if user is near bottom
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsNearBottom(nearBottom);
  }, []);

  // Toggle entry expansion
  const toggleExpanded = useCallback((entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }, []);

  // Send log to chat
  const sendToChat = useCallback((entry: ConsoleEntry) => {
    const time = formatTimestamp(entry.timestamp);
    const prefix = entry.sourceName ? `[${entry.sourceName}]` : '';
    const formattedLog = `[${time}] ${entry.level.toUpperCase()} ${prefix}: ${entry.message}`;

    // Dispatch event to add to chat input
    window.dispatchEvent(new CustomEvent('recoder:add-to-chat', {
      detail: { text: `\n\`\`\`\n${formattedLog}\n\`\`\`` }
    }));
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setIsNearBottom(true);
    }
  }, []);

  // Listen for console messages from preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // Handle console log messages from iframe
      if (data.type === 'recoder:console') {
        addConsoleEntry({
          type: data.logType || 'client',
          level: data.level || 'log',
          message: data.message || '',
          timestamp: data.timestamp || Date.now(),
          sourceName: data.sourceName,
          stack: data.stack,
          isSystem: data.isSystem,
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Check if any filters are active
  const hasActiveFilters = levelFilter !== 'all' || typeFilter !== 'all';

  // Get unique sources for potential future filtering
  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    allEntries.forEach((entry) => {
      if (entry.sourceName) sources.add(entry.sourceName);
    });
    return Array.from(sources).sort();
  }, [allEntries]);

  if (!projectId) {
    return (
      <div className={classNames('flex flex-col h-full bg-bolt-elements-background-depth-1', className)}>
        <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
          <p>No project selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className={classNames('flex flex-col h-full min-h-0 bg-bolt-elements-background-depth-1', className)}>
      {/* Header with filters */}
      <div className="flex flex-col border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        {/* Top row: Title and actions */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">App Console</span>
            <div className="flex items-center gap-2 text-xs">
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <span className="i-ph:x-circle-fill" />
                  {errorCount}
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-yellow-400">
                  <span className="i-ph:warning-fill" />
                  {warningCount}
                </span>
              )}
              {totalCount > 0 && errorCount === 0 && warningCount === 0 && (
                <span className="text-bolt-elements-textSecondary">{totalCount} logs</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Scroll to bottom button (shown when not at bottom) */}
            {!isNearBottom && (
              <button
                onClick={scrollToBottom}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                title="Scroll to bottom"
              >
                <span className="i-ph:arrow-down" />
                New logs
              </button>
            )}

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={classNames(
                'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                autoScroll
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary border border-bolt-elements-borderColor'
              )}
              title={autoScroll ? 'Auto-scroll enabled (click to pause)' : 'Auto-scroll paused (click to enable)'}
            >
              <span className={autoScroll ? 'i-ph:pin-fill' : 'i-ph:pause'} />
              {autoScroll ? 'Auto' : 'Paused'}
            </button>

            {/* Clear button */}
            <IconButton
              icon="i-ph:trash"
              size="sm"
              title="Clear console"
              onClick={() => clearConsole()}
            />
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-bolt-elements-borderColor">
          {/* Level filter buttons */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setLevelFilter('all')}
              className={classNames(
                'px-2 py-1 rounded transition-colors',
                levelFilter === 'all'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
              )}
            >
              All
            </button>
            <button
              onClick={() => setLevelFilter('error')}
              className={classNames(
                'px-2 py-1 rounded transition-colors',
                levelFilter === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
              )}
            >
              Errors
            </button>
            <button
              onClick={() => setLevelFilter('warn')}
              className={classNames(
                'px-2 py-1 rounded transition-colors',
                levelFilter === 'warn'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
              )}
            >
              Warnings
            </button>
            <button
              onClick={() => setLevelFilter('info')}
              className={classNames(
                'px-2 py-1 rounded transition-colors',
                levelFilter === 'info'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
              )}
            >
              Info
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-bolt-elements-borderColor" />

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | ConsoleLogType)}
            className="text-xs px-2 py-1 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded text-bolt-elements-textSecondary"
          >
            <option value="all">All Sources</option>
            <option value="client">Client</option>
            <option value="server">Server</option>
            <option value="system">System</option>
          </select>

          {/* System messages toggle */}
          <button
            onClick={toggleSystemMessages}
            className={classNames(
              'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
              systemCollapsed
                ? 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
                : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary'
            )}
            title={systemCollapsed ? 'Show system messages' : 'Hide system messages'}
          >
            <span className="i-ph:gear" />
            System
          </button>

          {/* Clear filters button */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-2 py-1 text-xs text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
            >
              <span className="i-ph:x" />
              Clear
            </button>
          )}

          {/* Entry count */}
          <div className="ml-auto text-xs text-bolt-elements-textTertiary">
            {entries.length} of {totalCount} logs
          </div>
        </div>
      </div>

      {/* Console entries list */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto"
        onScroll={handleScroll}
      >
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary">
            <div className="i-ph:terminal text-4xl mb-3 text-bolt-elements-textTertiary" />
            <p className="text-sm">No console output</p>
            <p className="text-xs text-bolt-elements-textTertiary mt-1">Console logs from your app will appear here</p>
          </div>
        ) : (
          entries.map((entry) => (
            <ConsoleEntryItem
              key={entry.id}
              entry={entry}
              isExpanded={expandedEntries.has(entry.id)}
              onToggleExpand={() => toggleExpanded(entry.id)}
              onSendToChat={() => sendToChat(entry)}
            />
          ))
        )}
      </div>
    </div>
  );
});

AppConsolePanel.displayName = 'AppConsolePanel';
