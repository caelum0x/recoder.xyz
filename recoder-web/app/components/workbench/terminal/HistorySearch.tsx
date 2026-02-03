import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { classNames } from '~/utils/classNames';
import { searchHistoryReverse, getUniqueCommands, type HistoryEntry } from '~/lib/terminal-history';

interface HistorySearchProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectCommand: (command: string) => void;
}

export const HistorySearch = memo(({
  projectId,
  isOpen,
  onClose,
  onSelectCommand,
}: HistorySearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<HistoryEntry & { index: number }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
      // Show recent commands initially
      const recent = getUniqueCommands(projectId, 10);
      setResults(recent.map((command, index) => ({
        command,
        timestamp: Date.now(),
        projectId,
        index,
      })));
    }
  }, [isOpen, projectId]);

  // Search as user types
  useEffect(() => {
    if (!isOpen) return;

    if (query.trim()) {
      const matches = searchHistoryReverse(projectId, query);
      setResults(matches.slice(0, 20)); // Limit to 20 results
    } else {
      // Show recent commands when query is empty
      const recent = getUniqueCommands(projectId, 10);
      setResults(recent.map((command, index) => ({
        command,
        timestamp: Date.now(),
        projectId,
        index,
      })));
    }
    setSelectedIndex(0);
  }, [query, projectId, isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelectCommand(results[selectedIndex].command);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        if (results[selectedIndex]) {
          setQuery(results[selectedIndex].command);
        }
        break;
    }
  }, [results, selectedIndex, onSelectCommand, onClose]);

  const handleSelect = useCallback((command: string) => {
    onSelectCommand(command);
    onClose();
  }, [onSelectCommand, onClose]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Search Panel */}
      <div className="relative bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor shadow-lg">
        {/* Search Input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-bolt-elements-borderColor">
          <div className="i-ph:magnifying-glass text-bolt-elements-textTertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search command history (Ctrl+R)..."
            className={classNames(
              'flex-1 bg-transparent text-sm text-bolt-elements-textPrimary',
              'placeholder:text-bolt-elements-textTertiary focus:outline-none'
            )}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex items-center gap-1 text-[10px] text-bolt-elements-textTertiary">
            <kbd className="px-1 py-0.5 rounded bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
              Enter
            </kbd>
            <span>select</span>
            <kbd className="px-1 py-0.5 rounded bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor ml-1">
              Esc
            </kbd>
            <span>close</span>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[200px] overflow-y-auto">
          {results.length > 0 ? (
            results.map((result, index) => (
              <button
                key={`${result.command}-${index}`}
                onClick={() => handleSelect(result.command)}
                className={classNames(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                  index === selectedIndex
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
                )}
              >
                <div className="i-ph:terminal-window text-xs text-bolt-elements-textTertiary" />
                <code className="flex-1 font-mono text-xs truncate">
                  {highlightMatch(result.command, query)}
                </code>
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-sm text-bolt-elements-textTertiary">
              {query ? 'No matching commands found' : 'No command history yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

HistorySearch.displayName = 'HistorySearch';

// Helper to highlight matching text
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <span className="bg-yellow-500/30 text-yellow-300">
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  );
}
