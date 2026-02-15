import { memo, useEffect, useState, useRef } from 'react';
import Fuse, { type FuseResult, type FuseResultMatch } from 'fuse.js';
import { classNames } from '~/utils/classNames';
import type { FileMap } from '~/lib/stores/files';

interface Props {
  files: FileMap;
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (filePath: string) => void;
}

interface SearchResult {
  path: string;
  matches?: readonly FuseResultMatch[];
}

export const FileSearchModal = memo(({ files, isOpen, onClose, onFileSelect }: Props) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Create fuse instance for fuzzy search
  const fuse = useRef<Fuse<string> | undefined>(undefined);

  useEffect(() => {
    // Build file paths list from FileMap
    const filePaths = Object.entries(files)
      .filter(([_, dirent]) => dirent?.type === 'file')
      .map(([path]) => path);

    // Initialize Fuse with file paths
    fuse.current = new Fuse(filePaths, {
      threshold: 0.4, // 0.4 = fairly flexible matching
      includeMatches: true,
      minMatchCharLength: 1,
      keys: [{
        name: 'path',
        weight: 1,
      }],
    });
  }, [files]);

  // Perform fuzzy search when query changes
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const searchResults = fuse.current?.search(query, { limit: 50 }) || [];
    const formattedResults: SearchResult[] = searchResults.map((result: FuseResult<string>) => ({
      path: result.item,
      matches: result.matches,
    }));

    setResults(formattedResults);
    setSelectedIndex(0);
  }, [query]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;

        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelectFile(results[selectedIndex].path);
          }
          break;

        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  const handleSelectFile = (filePath: string) => {
    onFileSelect(filePath);
    onClose();
  };

  const highlightMatches = (path: string, matches?: readonly FuseResultMatch[]) => {
    if (!matches || matches.length === 0) {
      return <span>{path}</span>;
    }

    const match = matches[0];
    const indices = match.indices;
    const parts: React.JSX.Element[] = [];
    let lastIndex = 0;

    indices.forEach(([start, end]: [number, number], i: number) => {
      // Add non-matched text
      if (start > lastIndex) {
        parts.push(
          <span key={`text-${i}`} className="text-bolt-elements-textSecondary">
            {path.slice(lastIndex, start)}
          </span>
        );
      }

      // Add matched text with highlight
      parts.push(
        <span key={`match-${i}`} className="text-bolt-elements-textPrimary font-semibold bg-bolt-elements-item-backgroundAccent/30">
          {path.slice(start, end + 1)}
        </span>
      );

      lastIndex = end + 1;
    });

    // Add remaining text
    if (lastIndex < path.length) {
      parts.push(
        <span key="text-end" className="text-bolt-elements-textSecondary">
          {path.slice(lastIndex)}
        </span>
      );
    }

    return <>{parts}</>;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-bolt-elements-background-depth-2 rounded-lg shadow-2xl border border-bolt-elements-borderColor overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bolt-elements-borderColor">
          <div className="i-ph:magnifying-glass text-xl text-bolt-elements-textTertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files..."
            className="flex-1 bg-transparent outline-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary"
          />
          <kbd className="px-2 py-1 text-xs bg-bolt-elements-background-depth-1 rounded border border-bolt-elements-borderColor text-bolt-elements-textTertiary">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          className="max-h-96 overflow-y-auto"
        >
          {query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-bolt-elements-textTertiary">
              No files found
            </div>
          )}

          {!query && (
            <div className="px-4 py-8 text-center text-bolt-elements-textTertiary">
              Type to search files...
            </div>
          )}

          {results.map((result, index) => (
            <button
              key={result.path}
              className={classNames(
                'w-full px-4 py-2 text-left flex items-center gap-3 transition-colors',
                {
                  'bg-bolt-elements-item-backgroundAccent': index === selectedIndex,
                  'hover:bg-bolt-elements-item-backgroundActive': index !== selectedIndex,
                }
              )}
              onClick={() => handleSelectFile(result.path)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="i-ph:file-duotone text-lg text-bolt-elements-textTertiary shrink-0" />
              <div className="flex-1 truncate text-sm">
                {highlightMatches(result.path, result.matches)}
              </div>
            </button>
          ))}
        </div>

        {/* Footer with keyboard hints */}
        <div className="px-4 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 flex items-center justify-between text-xs text-bolt-elements-textTertiary">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor">Enter</kbd>
              Select
            </span>
          </div>
          <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
});

export default FileSearchModal;
