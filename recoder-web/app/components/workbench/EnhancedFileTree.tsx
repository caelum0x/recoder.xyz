import { useState, useMemo, useCallback, memo, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import type { FileMap } from '~/lib/stores/files';
import { FileTree } from './FileTree';
import {
  // Stores
  expandedFoldersStore,
  selectedFilesStore,
  clipboardStore,
  searchQueryStore,
  searchActiveStore,
  sortOrderStore,
  dragStateStore,
  renamingPathStore,
  creatingInStore,
  focusedIndexStore,
  showHiddenFilesStore,
  fileMetadataStore,
  // Computed
  hasClipboardItems,
  isMultiSelectActive,
  clipboardOperation,
  // Actions
  expandAll,
  collapseAll,
  toggleFolder,
  revealPath,
  selectFile,
  toggleFileSelection,
  selectRange,
  selectAll,
  clearSelection,
  getSelectedFiles,
  copyToClipboard,
  cutToClipboard,
  clearClipboard,
  getClipboardItems,
  setSearchQuery,
  clearSearch,
  openSearch,
  closeSearch,
  startDrag,
  setDropTarget,
  endDrag,
  startRename,
  cancelRename,
  startCreateFile,
  startCreateFolder,
  cancelCreate,
  setFocusedIndex,
  // Utilities
  fuzzyFilterPaths,
  formatFileSize,
  formatModifiedDate,
  type ClipboardItem,
} from '~/lib/stores/file-tree-ui';

// Icon components using UnoCSS classes (Cloudflare Workers compatible)
const Search = ({ className }: { className?: string }) => <div className={`i-ph:magnifying-glass ${className || ''}`} />;
const FolderOpen = ({ className }: { className?: string }) => <div className={`i-ph:folder-open ${className || ''}`} />;
const File = ({ className }: { className?: string }) => <div className={`i-ph:file ${className || ''}`} />;
const X = ({ className }: { className?: string }) => <div className={`i-ph:x ${className || ''}`} />;

// Custom hook for debounced values
const useDebouncedValue = <T,>(value: T, delay = 200): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// Highlight matching text in search results with fuzzy support
const highlightMatch = (text: string, query: string): React.ReactNode => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    // Fuzzy highlight - highlight each matched character
    const result: React.ReactNode[] = [];
    let queryIndex = 0;
    for (let i = 0; i < text.length; i++) {
      if (queryIndex < lowerQuery.length && lowerText[i] === lowerQuery[queryIndex]) {
        result.push(
          <mark key={i} className="rounded-sm bg-blue-500/30 px-0.5 text-bolt-elements-textPrimary">
            {text[i]}
          </mark>
        );
        queryIndex++;
      } else {
        result.push(text[i]);
      }
    }
    return <>{result}</>;
  }

  const end = index + trimmedQuery.length;

  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-blue-500/30 px-0.5 text-bolt-elements-textPrimary">
        {text.slice(index, end)}
      </mark>
      {text.slice(end)}
    </>
  );
};

interface EnhancedFileTreeProps {
  files: FileMap;
  selectedFile?: string;
  onFileSelect?: (filePath: string) => void;
  onFileCreate?: (folderPath: string, fileName: string) => void;
  onFolderCreate?: (folderPath: string, folderName: string) => void;
  onFileDelete?: (filePath: string) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  onFileMove?: (sourcePath: string, destinationFolder: string) => void;
  onFileCopy?: (filePath: string) => void;
  onFileDuplicate?: (filePath: string, newPath: string) => void;
  onFilePaste?: (clipboardItems: ClipboardItem[], targetFolder: string) => void;
  rootFolder?: string;
  hideRoot?: boolean;
  collapsed?: boolean;
  allowFolderSelection?: boolean;
  hiddenFiles?: Array<string | RegExp>;
  unsavedFiles?: Set<string>;
  className?: string;
}

// File extension to icon/color mapping
const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  ts: { icon: 'i-ph:file-ts-duotone', color: 'text-blue-400' },
  tsx: { icon: 'i-ph:file-tsx-duotone', color: 'text-blue-500' },
  js: { icon: 'i-ph:file-js-duotone', color: 'text-yellow-400' },
  jsx: { icon: 'i-ph:file-jsx-duotone', color: 'text-yellow-500' },
  json: { icon: 'i-ph:file-duotone', color: 'text-yellow-300' },
  md: { icon: 'i-ph:file-md-duotone', color: 'text-bolt-elements-textSecondary' },
  css: { icon: 'i-ph:file-css-duotone', color: 'text-blue-300' },
  scss: { icon: 'i-ph:file-css-duotone', color: 'text-pink-400' },
  html: { icon: 'i-ph:file-html-duotone', color: 'text-orange-400' },
  py: { icon: 'i-ph:file-py-duotone', color: 'text-yellow-400' },
  rs: { icon: 'i-ph:file-rs-duotone', color: 'text-orange-500' },
  go: { icon: 'i-ph:file-duotone', color: 'text-cyan-400' },
  sql: { icon: 'i-ph:file-sql-duotone', color: 'text-blue-300' },
  prisma: { icon: 'i-ph:database-duotone', color: 'text-teal-400' },
  env: { icon: 'i-ph:gear-duotone', color: 'text-yellow-500' },
  yaml: { icon: 'i-ph:file-duotone', color: 'text-red-400' },
  yml: { icon: 'i-ph:file-duotone', color: 'text-red-400' },
  lock: { icon: 'i-ph:lock-duotone', color: 'text-bolt-elements-textTertiary' },
  gitignore: { icon: 'i-ph:git-branch-duotone', color: 'text-orange-400' },
};

export const EnhancedFileTree = memo(function EnhancedFileTree({
  files,
  selectedFile,
  onFileSelect,
  onFileCreate,
  onFolderCreate,
  onFileDelete,
  onFileRename,
  onFileMove,
  onFileCopy,
  onFileDuplicate,
  onFilePaste,
  rootFolder = '/home/project',
  hideRoot = true,
  collapsed,
  allowFolderSelection,
  hiddenFiles,
  unsavedFiles,
  className,
}: EnhancedFileTreeProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Nanostore subscriptions
  const searchActive = useStore(searchActiveStore);
  const sortOrder = useStore(sortOrderStore);
  const expandedFolders = useStore(expandedFoldersStore);
  const selectedFiles = useStore(selectedFilesStore);
  const clipboard = useStore(clipboardStore);
  const dragState = useStore(dragStateStore);
  const renamingPath = useStore(renamingPathStore);
  const creatingIn = useStore(creatingInStore);
  const focusedIndex = useStore(focusedIndexStore);
  const showHiddenFiles = useStore(showHiddenFilesStore);
  const fileMetadata = useStore(fileMetadataStore);
  const hasClipboard = useStore(hasClipboardItems);
  const isMultiSelect = useStore(isMultiSelectActive);
  const clipboardOp = useStore(clipboardOperation);

  // Debounce search query by 200ms
  const debouncedSearchQuery = useDebouncedValue(localSearchQuery, 200);

  // Hidden folders to exclude from count
  const HIDDEN_FOLDERS = ['node_modules', '.next', '.astro', '.git', 'dist', 'build', '.cache'];

  // Calculate file stats
  const fileStats = useMemo(() => {
    const paths = Object.keys(files);

    // Filter out hidden files/folders
    const visiblePaths = paths.filter(path => {
      const parts = path.split('/');
      const shouldHide = parts.some(part => HIDDEN_FOLDERS.includes(part));
      if (shouldHide) return false;

      // Also filter dotfiles if showHiddenFiles is false
      if (!showHiddenFiles) {
        const fileName = parts[parts.length - 1];
        if (fileName && fileName.startsWith('.')) return false;
      }

      return true;
    });

    // Count only visible files
    const fileCount = visiblePaths.filter(path => {
      const entry = files[path];
      return entry?.type === 'file';
    }).length;

    // Count only visible folders
    const visibleFolders = new Set(
      visiblePaths
        .map(p => p.split('/').slice(0, -1).join('/'))
        .filter(Boolean)
    );

    return {
      files: fileCount,
      folders: visibleFolders.size,
    };
  }, [files, showHiddenFiles]);

  // Get all folder paths for expand all functionality
  const allFolderPaths = useMemo(() => {
    const folders = new Set<string>();
    Object.entries(files).forEach(([path, dirent]) => {
      if (dirent?.type === 'folder') {
        folders.add(path);
      } else {
        // Extract folder paths from file paths
        const parts = path.split('/');
        parts.pop();
        let currentPath = '';
        for (const part of parts) {
          if (part) {
            currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
            folders.add(currentPath);
          }
        }
      }
    });
    return Array.from(folders);
  }, [files]);

  // Get all file paths for filtering
  const allFilePaths = useMemo(() => {
    return Object.keys(files).filter(path => files[path]?.type === 'file');
  }, [files]);

  // Filter files based on search with fuzzy matching
  const filteredFiles = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return files;

    const fuzzyResults = fuzzyFilterPaths(allFilePaths, debouncedSearchQuery);
    const matchedPaths = new Set(fuzzyResults.map(r => r.path));

    const filtered: FileMap = {};

    Object.entries(files).forEach(([path, content]) => {
      if (matchedPaths.has(path)) {
        filtered[path] = content;
        // Also include parent folders
        const parts = path.split('/');
        parts.pop();
        let currentPath = '';
        for (const part of parts) {
          if (part) {
            currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
            if (!filtered[currentPath]) {
              filtered[currentPath] = { type: 'folder' };
            }
          }
        }
      }
    });

    return filtered;
  }, [files, allFilePaths, debouncedSearchQuery]);

  // Count filtered results
  const filteredFileCount = useMemo(() => {
    return Object.keys(filteredFiles).filter(path => {
      const entry = filteredFiles[path];
      return entry?.type === 'file';
    }).length;
  }, [filteredFiles]);

  const isSearchActive = debouncedSearchQuery.trim().length > 0;
  const hasNoResults = isSearchActive && filteredFileCount === 0;

  // Memoize callback props
  const memoizedOnFileSelect = useCallback((filePath: string) => {
    selectFile(filePath);
    onFileSelect?.(filePath);
  }, [onFileSelect]);

  const memoizedOnFileCreate = useCallback((folderPath: string, fileName: string) => {
    onFileCreate?.(folderPath, fileName);
  }, [onFileCreate]);

  const memoizedOnFolderCreate = useCallback((folderPath: string, folderName: string) => {
    onFolderCreate?.(folderPath, folderName);
  }, [onFolderCreate]);

  const memoizedOnFileDelete = useCallback((filePath: string) => {
    onFileDelete?.(filePath);
  }, [onFileDelete]);

  const memoizedOnFileRename = useCallback((oldPath: string, newPath: string) => {
    onFileRename?.(oldPath, newPath);
  }, [onFileRename]);

  const memoizedOnFileCopy = useCallback((filePath: string) => {
    onFileCopy?.(filePath);
  }, [onFileCopy]);

  const memoizedOnFileMove = useCallback((sourcePath: string, destinationFolder: string) => {
    onFileMove?.(sourcePath, destinationFolder);
  }, [onFileMove]);

  // Handle keyboard shortcut for search
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Cmd/Ctrl + P to open/focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      openSearch();
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
    // Escape to close search
    if (e.key === 'Escape' && searchActive) {
      e.preventDefault();
      closeSearch();
      setLocalSearchQuery('');
    }
    // Cmd/Ctrl + C to copy
    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      const selected = getSelectedFiles();
      if (selected.length > 0) {
        e.preventDefault();
        const types = selected.map(path => files[path]?.type === 'folder' ? 'folder' : 'file') as ('file' | 'folder')[];
        copyToClipboard(selected, types);
      }
    }
    // Cmd/Ctrl + X to cut
    if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
      const selected = getSelectedFiles();
      if (selected.length > 0) {
        e.preventDefault();
        const types = selected.map(path => files[path]?.type === 'folder' ? 'folder' : 'file') as ('file' | 'folder')[];
        cutToClipboard(selected, types);
      }
    }
    // Cmd/Ctrl + V to paste
    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      const items = getClipboardItems();
      if (items.length > 0 && selectedFile && onFilePaste) {
        e.preventDefault();
        const targetFolder = files[selectedFile]?.type === 'folder'
          ? selectedFile
          : selectedFile.substring(0, selectedFile.lastIndexOf('/'));
        onFilePaste(items, targetFolder);
        if (items[0].operation === 'cut') {
          clearClipboard();
        }
      }
    }
    // Cmd/Ctrl + A to select all
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      selectAll(allFilePaths);
    }
    // Cmd/Ctrl + D to duplicate
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      const selected = getSelectedFiles();
      if (selected.length === 1 && onFileDuplicate) {
        e.preventDefault();
        const path = selected[0];
        const lastDot = path.lastIndexOf('.');
        const lastSlash = path.lastIndexOf('/');
        const baseName = lastDot > lastSlash ? path.substring(0, lastDot) : path;
        const ext = lastDot > lastSlash ? path.substring(lastDot) : '';
        const newPath = `${baseName}-copy${ext}`;
        onFileDuplicate(path, newPath);
      }
    }
    // F2 to rename
    if (e.key === 'F2') {
      const selected = getSelectedFiles();
      if (selected.length === 1) {
        e.preventDefault();
        startRename(selected[0]);
      }
    }
    // Delete/Backspace to delete
    if ((e.key === 'Delete' || e.key === 'Backspace') && (e.metaKey || e.ctrlKey)) {
      const selected = getSelectedFiles();
      if (selected.length > 0 && onFileDelete) {
        e.preventDefault();
        selected.forEach(path => onFileDelete(path));
        clearSelection();
      }
    }
  }, [searchActive, files, selectedFile, allFilePaths, onFileDelete, onFileDuplicate, onFilePaste]);

  // Global keyboard shortcut for Cmd/Ctrl+P
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        openSearch();
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleClearSearch = useCallback(() => {
    setLocalSearchQuery('');
    closeSearch();
  }, []);

  const handleExpandAll = useCallback(() => {
    expandAll(allFolderPaths);
  }, [allFolderPaths]);

  const handleCollapseAll = useCallback(() => {
    collapseAll();
  }, []);

  // Handle new file button click
  const handleNewFile = useCallback(() => {
    const targetFolder = selectedFile
      ? (files[selectedFile]?.type === 'folder' ? selectedFile : selectedFile.substring(0, selectedFile.lastIndexOf('/')))
      : rootFolder;
    startCreateFile(targetFolder);
  }, [selectedFile, files, rootFolder]);

  // Handle new folder button click
  const handleNewFolder = useCallback(() => {
    const targetFolder = selectedFile
      ? (files[selectedFile]?.type === 'folder' ? selectedFile : selectedFile.substring(0, selectedFile.lastIndexOf('/')))
      : rootFolder;
    startCreateFolder(targetFolder);
  }, [selectedFile, files, rootFolder]);

  return (
    <div
      ref={containerRef}
      className={`h-full flex flex-col ${className || ''}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header with stats, search, and actions */}
      <div className="p-2 border-b border-bolt-elements-borderColor">
        {/* Top row: Stats and action buttons */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <span className="flex items-center gap-1" title={`${fileStats.files} files`}>
              <File className="w-3 h-3" />
              {fileStats.files}
            </span>
            <span className="flex items-center gap-1" title={`${fileStats.folders} folders`}>
              <FolderOpen className="w-3 h-3" />
              {fileStats.folders}
            </span>
          </div>

          {/* Action buttons removed — use sidebar Search tab and keyboard shortcuts instead */}
        </div>

        {/* Clipboard indicator */}
        {hasClipboard && (
          <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary mb-2 py-1 px-2 bg-bolt-elements-background-depth-2 rounded">
            <span className={clipboardOp === 'cut' ? 'i-ph:scissors' : 'i-ph:copy'} />
            <span>{clipboard.length} item{clipboard.length > 1 ? 's' : ''} {clipboardOp === 'cut' ? 'cut' : 'copied'}</span>
            <button
              onClick={clearClipboard}
              className="ml-auto hover:text-bolt-elements-textPrimary"
              title="Clear clipboard"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Multi-selection indicator */}
        {isMultiSelect && (
          <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary mb-2 py-1 px-2 bg-blue-500/10 border border-blue-500/30 rounded">
            <span className="i-ph:selection" />
            <span>{selectedFiles.size} items selected</span>
            <button
              onClick={clearSelection}
              className="ml-auto hover:text-bolt-elements-textPrimary"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Search input */}
        {searchActive && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-bolt-elements-textSecondary" />
            <input
              ref={searchInputRef}
              type="text"
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              placeholder="Search files... (fuzzy matching)"
              autoFocus
              className="w-full pl-7 pr-7 py-1.5 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded outline-none focus:border-bolt-elements-borderColorActive text-bolt-elements-textPrimary placeholder:text-bolt-elements-textSecondary"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  handleClearSearch();
                }
              }}
            />
            {localSearchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Search results count */}
            {isSearchActive && (
              <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                {filteredFileCount} file{filteredFileCount !== 1 ? 's' : ''} found
              </div>
            )}
          </div>
        )}
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        {hasNoResults ? (
          <div className="px-3 py-4 text-sm text-bolt-elements-textSecondary text-center">
            <div className="i-ph:magnifying-glass w-8 h-8 mx-auto mb-2 opacity-50" />
            <div>No files matched your search.</div>
            <button
              onClick={handleClearSearch}
              className="mt-2 text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <FileTree
            files={filteredFiles}
            selectedFile={selectedFile}
            onFileSelect={memoizedOnFileSelect}
            onFileCreate={memoizedOnFileCreate}
            onFolderCreate={memoizedOnFolderCreate}
            onFileDelete={memoizedOnFileDelete}
            onFileRename={memoizedOnFileRename}
            onFileMove={memoizedOnFileMove}
            onFileCopy={memoizedOnFileCopy}
            rootFolder={rootFolder}
            hideRoot={hideRoot}
            collapsed={collapsed}
            allowFolderSelection={allowFolderSelection}
            hiddenFiles={hiddenFiles}
            unsavedFiles={unsavedFiles}
            className={className}
            searchQuery={debouncedSearchQuery}
          />
        )}
      </div>

    </div>
  );
});
