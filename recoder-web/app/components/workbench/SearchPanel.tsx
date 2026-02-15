/**
 * SearchPanel - VSCode-style global file search
 * Inspired by vscode/src/vs/workbench/contrib/search/browser/searchWidget.ts
 * Copyright (c) Microsoft Corporation. Licensed under MIT.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerPost } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('SearchPanel');

interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchOptions {
  regex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  include: string;
  exclude: string;
}

interface SearchPanelProps {
  onFileOpen?: (file: string, line?: number, column?: number) => void;
  className?: string;
}

export const SearchPanel = memo(({ onFileOpen, className = '' }: SearchPanelProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);

  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<SearchOptions>({
    regex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: 'node_modules,dist,.git',
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // PERFORMANCE: Memoize grouping of results by file to avoid recalculation on every render
  const resultsByFile = useMemo(() => {
    return results.reduce((acc, result) => {
      if (!acc[result.file]) acc[result.file] = [];
      acc[result.file].push(result);
      return acc;
    }, {} as Record<string, SearchResult[]>);
  }, [results]);

  const fileCount = Object.keys(resultsByFile).length;

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !projectId || !containerReady) return;

    setIsSearching(true);
    try {
      const data = await dockerPost<{ results?: SearchResult[] }>(`/api/search/${projectId}`, { query, options });
      setResults(data.results || []);
      // Reset collapsed state when new search
      setCollapsedFiles(new Set());
    } catch (error) {
      logger.error('[Search] Error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [query, options, projectId, containerReady]);

  // Debounced search on query change
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length >= 2) {
      searchTimeoutRef.current = setTimeout(handleSearch, 300);
    } else {
      setResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, handleSearch]);

  // Re-search when options change (if query exists)
  useEffect(() => {
    if (query.length >= 2) {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(handleSearch, 300);
    }
  }, [options]);

  const handleReplace = useCallback(async (file: string) => {
    if (!replaceText || !projectId) return;

    setIsReplacing(true);
    try {
      await dockerPost(`/api/replace/${projectId}`, {
        searchQuery: query,
        replaceText,
        files: [`/workspace/${file}`],
      });

      // Refresh search
      handleSearch();
    } catch (error) {
      logger.error('[Search] Replace error:', error);
    } finally {
      setIsReplacing(false);
    }
  }, [query, replaceText, projectId, handleSearch]);

  const handleReplaceAll = useCallback(async () => {
    if (!replaceText || !projectId || results.length === 0) return;

    setIsReplacing(true);
    const files = Object.keys(resultsByFile).map(f => `/workspace/${f}`);

    try {
      await dockerPost(`/api/replace/${projectId}`, { searchQuery: query, replaceText, files });
      handleSearch();
    } catch (error) {
      logger.error('[Search] Replace all error:', error);
    } finally {
      setIsReplacing(false);
    }
  }, [query, replaceText, projectId, resultsByFile, handleSearch, results.length]);

  const handleResultClick = useCallback((result: SearchResult) => {
    onFileOpen?.(result.file, result.line, result.column);
  }, [onFileOpen]);

  const toggleFileCollapse = useCallback((file: string) => {
    setCollapsedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedFiles(new Set(Object.keys(resultsByFile)));
  }, [resultsByFile]);

  const expandAll = useCallback(() => {
    setCollapsedFiles(new Set());
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setCollapsedFiles(new Set());
    inputRef.current?.focus();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+F to focus search
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Escape to clear search when input is focused
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        e.preventDefault();
        if (query) {
          clearSearch();
        } else {
          inputRef.current?.blur();
        }
      }
      // Cmd+Shift+H to focus replace input
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'h') {
        e.preventDefault();
        if (!showReplace) {
          setShowReplace(true);
        }
        setTimeout(() => replaceInputRef.current?.focus(), 0);
      }
      // Enter in search to trigger immediate search
      if (e.key === 'Enter' && document.activeElement === inputRef.current) {
        e.preventDefault();
        handleSearch();
      }
      // Enter in replace input to replace all
      if (e.key === 'Enter' && document.activeElement === replaceInputRef.current) {
        e.preventDefault();
        handleReplaceAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [query, showReplace, handleSearch, handleReplaceAll, clearSearch]);

  // Get file icon based on extension
  const getFileIcon = useCallback((file: string) => {
    const ext = file.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'i-ph:file-ts text-blue-400';
      case 'js':
      case 'jsx':
        return 'i-ph:file-js text-yellow-400';
      case 'json':
        return 'i-ph:file-code text-yellow-300';
      case 'css':
      case 'scss':
      case 'sass':
        return 'i-ph:file-css text-blue-300';
      case 'html':
        return 'i-ph:file-html text-orange-400';
      case 'md':
      case 'mdx':
        return 'i-ph:file-doc text-bolt-elements-textSecondary';
      case 'py':
        return 'i-ph:file-py text-green-400';
      case 'rs':
        return 'i-ph:file text-orange-500';
      case 'go':
        return 'i-ph:file text-cyan-400';
      default:
        return 'i-ph:file text-bolt-elements-textTertiary';
    }
  }, []);

  return (
    <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
      {/* Search Input */}
      <div className="p-2 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-1">
          {/* Toggle Replace */}
          <button
            onClick={() => setShowReplace(!showReplace)}
            className="p-1 hover:bg-bolt-elements-background-depth-2 rounded transition-colors"
            title={showReplace ? 'Hide Replace (Cmd+Shift+H)' : 'Show Replace (Cmd+Shift+H)'}
            aria-expanded={showReplace}
            aria-label={showReplace ? 'Hide replace input' : 'Show replace input'}
          >
            <span className={`i-ph:caret-${showReplace ? 'down' : 'right'} text-sm`} />
          </button>

          {/* Search Input */}
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search (Cmd+Shift+F)"
              className="w-full px-2 py-1 pr-8 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
              aria-label="Search in files"
            />
            {query && (
              <button
                onClick={clearSearch}
                className="absolute right-6 top-1/2 -translate-y-1/2 p-0.5 hover:bg-bolt-elements-background-depth-3 rounded text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors"
                title="Clear search (Escape)"
                aria-label="Clear search"
              >
                <span className="i-ph:x text-xs" />
              </button>
            )}
            {isSearching && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 i-ph:spinner animate-spin text-sm text-blue-400" />
            )}
          </div>
        </div>

        {/* Replace Input */}
        {showReplace && (
          <div className="flex items-center gap-1 ml-6 mt-1.5">
            <input
              ref={replaceInputRef}
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace"
              className="flex-1 px-2 py-1 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
              aria-label="Replace text"
            />
            <button
              onClick={handleReplaceAll}
              disabled={!replaceText || results.length === 0 || isReplacing}
              className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Replace All (Enter in replace field)"
              aria-label="Replace all occurrences"
            >
              {isReplacing ? (
                <span className="i-ph:spinner animate-spin text-sm text-blue-400" />
              ) : (
                <span className="i-ph:arrows-clockwise text-sm" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      <div ref={resultsContainerRef} className="flex-1 overflow-auto" role="tree" aria-label="Search results">
        {!containerReady && (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
            Waiting for container to be ready...
          </div>
        )}

        {containerReady && results.length === 0 && query.length >= 2 && !isSearching && (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            <span className="i-ph:magnifying-glass text-2xl block mb-2 mx-auto opacity-50" />
            No results found for "{query}"
          </div>
        )}

        {containerReady && !query && (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            <span className="i-ph:magnifying-glass text-3xl block mb-3 mx-auto opacity-50" />
            <p className="mb-2">Search across all project files</p>
            <div className="text-xs text-bolt-elements-textTertiary/70 space-y-1">
              <p>
                Press <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded text-xs border border-bolt-elements-borderColor">Cmd+Shift+F</kbd> to focus
              </p>
              <p>
                Press <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded text-xs border border-bolt-elements-borderColor">Cmd+Shift+H</kbd> for replace
              </p>
            </div>
          </div>
        )}

        {containerReady && query.length === 1 && (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            Type at least 2 characters to search...
          </div>
        )}

        {results.length > 0 && (
          <>
            {/* Results Header */}
            <div className="flex items-center justify-between px-2 py-1.5 text-xs text-bolt-elements-textTertiary border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/50 sticky top-0 z-10">
              <span>{results.length} results in {fileCount} files</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={expandAll}
                  className="p-1 hover:bg-bolt-elements-background-depth-2 rounded transition-colors"
                  title="Expand All"
                  aria-label="Expand all file results"
                >
                  <span className="i-ph:caret-down text-xs" />
                </button>
                <button
                  onClick={collapseAll}
                  className="p-1 hover:bg-bolt-elements-background-depth-2 rounded transition-colors"
                  title="Collapse All"
                  aria-label="Collapse all file results"
                >
                  <span className="i-ph:caret-right text-xs" />
                </button>
              </div>
            </div>

            {Object.entries(resultsByFile).map(([file, fileResults]) => {
              const isCollapsed = collapsedFiles.has(file);

              return (
                <div
                  key={file}
                  className="border-b border-bolt-elements-borderColor/50"
                  role="treeitem"
                  aria-expanded={!isCollapsed}
                >
                  {/* File Header */}
                  <div
                    className="flex items-center gap-2 px-2 py-1.5 bg-bolt-elements-background-depth-2 text-sm cursor-pointer hover:bg-bolt-elements-background-depth-2 transition-colors"
                    onClick={() => toggleFileCollapse(file)}
                  >
                    <span className={`i-ph:caret-${isCollapsed ? 'right' : 'down'} text-xs text-bolt-elements-textTertiary`} />
                    <span className={getFileIcon(file)} />
                    <span className="font-medium truncate flex-1 text-bolt-elements-textPrimary">{file}</span>
                    <span className="text-bolt-elements-textTertiary text-xs px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded">
                      {fileResults.length}
                    </span>
                    {showReplace && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplace(file);
                        }}
                        disabled={!replaceText || isReplacing}
                        className="p-1 hover:bg-bolt-elements-background-depth-3 rounded disabled:opacity-50 transition-colors"
                        title="Replace in file"
                        aria-label={`Replace all in ${file}`}
                      >
                        <span className="i-ph:arrows-clockwise text-xs" />
                      </button>
                    )}
                  </div>

                  {/* File Results */}
                  {!isCollapsed && (
                    <div role="group">
                      {fileResults.map((result, idx) => (
                        <div
                          key={`${file}-${result.line}-${idx}`}
                          onClick={() => handleResultClick(result)}
                          className="flex items-start gap-2 px-4 py-1 hover:bg-bolt-elements-background-depth-3 cursor-pointer text-sm transition-colors group"
                          role="treeitem"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleResultClick(result);
                            }
                          }}
                        >
                          <span className="text-bolt-elements-textTertiary w-8 text-right shrink-0 text-xs font-mono group-hover:text-bolt-elements-textSecondary">
                            {result.line}
                          </span>
                          <span className="truncate text-xs font-mono">
                            <span className="text-bolt-elements-textTertiary">
                              {result.text.substring(0, result.matchStart)}
                            </span>
                            <span className="bg-yellow-500/30 text-yellow-200 px-0.5 rounded">
                              {result.text.substring(result.matchStart, result.matchEnd)}
                            </span>
                            <span className="text-bolt-elements-textTertiary">
                              {result.text.substring(result.matchEnd)}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
});

SearchPanel.displayName = 'SearchPanel';

export default SearchPanel;
