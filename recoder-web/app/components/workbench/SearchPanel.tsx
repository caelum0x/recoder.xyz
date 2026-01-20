/**
 * SearchPanel - VSCode-style global file search
 * Inspired by vscode/src/vs/workbench/contrib/search/browser/searchWidget.ts
 * Copyright (c) Microsoft Corporation. Licensed under MIT.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerPost } from '~/lib/services/docker-api';

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
  const [options, setOptions] = useState<SearchOptions>({
    regex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: 'node_modules,dist,.git',
  });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Group results by file
  const resultsByFile = results.reduce((acc, result) => {
    if (!acc[result.file]) acc[result.file] = [];
    acc[result.file].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !projectId || !containerReady) return;

    setIsSearching(true);
    try {
      const data = await dockerPost<{ results?: SearchResult[] }>(`/api/search/${projectId}`, { query, options });
      setResults(data.results || []);
    } catch (error) {
      console.error('[Search] Error:', error);
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

  const handleReplace = useCallback(async (file: string) => {
    if (!replaceText || !projectId) return;

    try {
      await dockerPost(`/api/replace/${projectId}`, {
        searchQuery: query,
        replaceText,
        files: [`/workspace/${file}`],
      });

      // Refresh search
      handleSearch();
    } catch (error) {
      console.error('[Search] Replace error:', error);
    }
  }, [query, replaceText, projectId, handleSearch]);

  const handleReplaceAll = useCallback(async () => {
    if (!replaceText || !projectId) return;

    const files = Object.keys(resultsByFile).map(f => `/workspace/${f}`);

    try {
      await dockerPost(`/api/replace/${projectId}`, { searchQuery: query, replaceText, files });
      handleSearch();
    } catch (error) {
      console.error('[Search] Replace all error:', error);
    }
  }, [query, replaceText, projectId, resultsByFile, handleSearch]);

  const handleResultClick = useCallback((result: SearchResult) => {
    onFileOpen?.(result.file, result.line, result.column);
  }, [onFileOpen]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
      {/* Search Input */}
      <div className="p-2 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-1 mb-2">
          {/* Toggle Replace */}
          <button
            onClick={() => setShowReplace(!showReplace)}
            className="p-1 hover:bg-bolt-elements-background-depth-3 rounded"
            title={showReplace ? 'Hide Replace' : 'Show Replace'}
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
              placeholder="Search"
              className="w-full px-2 py-1 text-sm text-white placeholder-gray-400 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
            />
            {isSearching && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 i-ph:spinner animate-spin text-sm" />
            )}
          </div>
          
          {/* Options */}
          <button
            onClick={() => setOptions(o => ({ ...o, caseSensitive: !o.caseSensitive }))}
            className={`p-1 rounded text-xs ${options.caseSensitive ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-bolt-elements-background-depth-3'}`}
            title="Match Case"
          >
            Aa
          </button>
          <button
            onClick={() => setOptions(o => ({ ...o, wholeWord: !o.wholeWord }))}
            className={`p-1 rounded text-xs ${options.wholeWord ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-bolt-elements-background-depth-3'}`}
            title="Match Whole Word"
          >
            <span className="i-ph:text-aa" />
          </button>
          <button
            onClick={() => setOptions(o => ({ ...o, regex: !o.regex }))}
            className={`p-1 rounded text-xs ${options.regex ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-bolt-elements-background-depth-3'}`}
            title="Use Regular Expression"
          >
            .*
          </button>
        </div>
        
        {/* Replace Input */}
        {showReplace && (
          <div className="flex items-center gap-1 ml-6">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace"
              className="flex-1 px-2 py-1 text-sm text-white placeholder-gray-400 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleReplaceAll}
              disabled={!replaceText || results.length === 0}
              className="p-1 hover:bg-bolt-elements-background-depth-3 rounded disabled:opacity-50"
              title="Replace All"
            >
              <span className="i-ph:arrows-clockwise text-sm" />
            </button>
          </div>
        )}
        
        {/* Include/Exclude */}
        <div className="flex gap-2 mt-2 text-xs">
          <input
            type="text"
            value={options.include}
            onChange={(e) => setOptions(o => ({ ...o, include: e.target.value }))}
            placeholder="files to include"
            className="flex-1 px-2 py-1 text-white placeholder-gray-400 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={options.exclude}
            onChange={(e) => setOptions(o => ({ ...o, exclude: e.target.value }))}
            placeholder="files to exclude"
            className="flex-1 px-2 py-1 text-white placeholder-gray-400 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      
      {/* Results */}
      <div className="flex-1 overflow-auto">
        {!containerReady && (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
            Waiting for container to be ready...
          </div>
        )}

        {containerReady && results.length === 0 && query.length >= 2 && !isSearching && (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            No results found
          </div>
        )}

        {containerReady && !query && (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            <span className="i-ph:magnifying-glass text-2xl block mb-2 mx-auto" />
            Type to search files...
            <div className="text-xs mt-2 text-bolt-elements-textTertiary/70">
              Press <kbd className="px-1 py-0.5 bg-bolt-elements-background-depth-3 rounded text-xs">Cmd+Shift+F</kbd> to focus
            </div>
          </div>
        )}

        {containerReady && query.length === 1 && (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            Type at least 2 characters to search...
          </div>
        )}

        {results.length > 0 && (
          <div className="p-2 text-xs text-bolt-elements-textTertiary border-b border-bolt-elements-borderColor">
            {results.length} results in {Object.keys(resultsByFile).length} files
          </div>
        )}
        
        {Object.entries(resultsByFile).map(([file, fileResults]) => (
          <div key={file} className="border-b border-bolt-elements-borderColor">
            {/* File Header */}
            <div className="flex items-center gap-2 px-2 py-1 bg-bolt-elements-background-depth-2 text-sm">
              <span className="i-ph:file text-bolt-elements-textTertiary" />
              <span className="font-medium truncate">{file}</span>
              <span className="text-bolt-elements-textTertiary">({fileResults.length})</span>
              {showReplace && (
                <button
                  onClick={() => handleReplace(file)}
                  className="ml-auto p-1 hover:bg-bolt-elements-background-depth-3 rounded"
                  title="Replace in file"
                >
                  <span className="i-ph:arrows-clockwise text-xs" />
                </button>
              )}
            </div>
            
            {/* File Results */}
            {fileResults.map((result, idx) => (
              <div
                key={`${file}-${result.line}-${idx}`}
                onClick={() => handleResultClick(result)}
                className="flex items-start gap-2 px-4 py-1 hover:bg-bolt-elements-background-depth-2 cursor-pointer text-sm"
              >
                <span className="text-bolt-elements-textTertiary w-8 text-right shrink-0">
                  {result.line}
                </span>
                <span className="truncate">
                  {result.text.substring(0, result.matchStart)}
                  <span className="bg-yellow-500/30 text-yellow-200">
                    {result.text.substring(result.matchStart, result.matchEnd)}
                  </span>
                  {result.text.substring(result.matchEnd)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

SearchPanel.displayName = 'SearchPanel';

export default SearchPanel;
