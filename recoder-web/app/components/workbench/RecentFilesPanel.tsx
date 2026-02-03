/**
 * RecentFilesPanel Component
 * Shows recently opened files for quick access
 * Can be displayed as a dropdown or modal picker
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import {
  recentFilesAtom,
  clearRecentFiles,
  removeRecentFile,
  type RecentFile,
} from '~/lib/stores/recent-files';

// File extension to icon class mapping (matching FileTree.tsx)
const FILE_ICON_MAP: Record<string, string> = {
  ts: 'i-ph:file-ts-duotone text-blue-400',
  tsx: 'i-ph:file-tsx-duotone text-blue-500',
  js: 'i-ph:file-js-duotone text-yellow-400',
  jsx: 'i-ph:file-jsx-duotone text-yellow-500',
  mjs: 'i-ph:file-js-duotone text-yellow-400',
  cjs: 'i-ph:file-js-duotone text-yellow-400',
  html: 'i-ph:file-html-duotone text-orange-400',
  css: 'i-ph:file-css-duotone text-blue-300',
  scss: 'i-ph:file-css-duotone text-pink-400',
  sass: 'i-ph:file-css-duotone text-pink-400',
  less: 'i-ph:file-css-duotone text-indigo-400',
  json: 'i-ph:file-duotone text-yellow-300',
  yaml: 'i-ph:file-duotone text-red-400',
  yml: 'i-ph:file-duotone text-red-400',
  md: 'i-ph:file-md-duotone text-bolt-elements-textSecondary',
  mdx: 'i-ph:file-md-duotone text-yellow-400',
  txt: 'i-ph:file-text-duotone text-bolt-elements-textSecondary',
  png: 'i-ph:file-image-duotone text-purple-400',
  jpg: 'i-ph:file-image-duotone text-purple-400',
  jpeg: 'i-ph:file-image-duotone text-purple-400',
  gif: 'i-ph:file-image-duotone text-purple-400',
  svg: 'i-ph:file-svg-duotone text-orange-400',
  py: 'i-ph:file-py-duotone text-yellow-400',
  rs: 'i-ph:file-rs-duotone text-orange-500',
  go: 'i-ph:file-duotone text-cyan-400',
  java: 'i-ph:file-duotone text-red-400',
  sql: 'i-ph:file-sql-duotone text-blue-300',
  prisma: 'i-ph:database-duotone text-teal-400',
  env: 'i-ph:gear-duotone text-yellow-500',
  sh: 'i-ph:terminal-duotone text-green-400',
  bash: 'i-ph:terminal-duotone text-green-400',
  vue: 'i-ph:file-vue-duotone text-green-500',
};

const SPECIAL_FILE_ICONS: Record<string, string> = {
  'package.json': 'i-ph:package-duotone text-green-400',
  'tsconfig.json': 'i-ph:gear-duotone text-blue-400',
  'tailwind.config.js': 'i-ph:gear-duotone text-cyan-400',
  'tailwind.config.ts': 'i-ph:gear-duotone text-cyan-400',
  'vite.config.js': 'i-ph:lightning-duotone text-purple-400',
  'vite.config.ts': 'i-ph:lightning-duotone text-purple-400',
  '.gitignore': 'i-ph:git-branch-duotone text-orange-400',
  '.env': 'i-ph:gear-duotone text-yellow-500',
  '.env.local': 'i-ph:gear-duotone text-yellow-500',
  'Dockerfile': 'i-ph:cube-duotone text-blue-400',
  'README.md': 'i-ph:book-open-duotone text-blue-300',
};

function getFileIcon(fileName: string): string {
  if (SPECIAL_FILE_ICONS[fileName]) {
    return SPECIAL_FILE_ICONS[fileName];
  }

  if (fileName.startsWith('.')) {
    const dotfileName = fileName.slice(1);
    if (FILE_ICON_MAP[dotfileName]) {
      return FILE_ICON_MAP[dotfileName];
    }
  }

  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && FILE_ICON_MAP[ext]) {
    return FILE_ICON_MAP[ext];
  }

  return 'i-ph:file-duotone text-bolt-elements-textSecondary';
}

function formatTimestamp(timestamp: number): string {
  const diff = Date.now() - timestamp;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

interface RecentFilesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (filePath: string) => void;
  currentFile?: string;
}

export const RecentFilesPanel = memo(function RecentFilesPanel({
  isOpen,
  onClose,
  onFileSelect,
  currentFile,
}: RecentFilesPanelProps) {
  const recentFiles = useStore(recentFilesAtom);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter out current file and apply search
  const filteredFiles = recentFiles.filter((file) => {
    if (file.path === currentFile) return false;
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      file.name.toLowerCase().includes(query) ||
      file.path.toLowerCase().includes(query)
    );
  });

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredFiles.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredFiles.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredFiles[selectedIndex]) {
            onFileSelect(filteredFiles[selectedIndex].path);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Delete':
        case 'Backspace':
          // Only delete if input is empty and Shift is held
          if (e.shiftKey && searchQuery === '' && filteredFiles[selectedIndex]) {
            e.preventDefault();
            removeRecentFile(filteredFiles[selectedIndex].path);
          }
          break;
      }
    },
    [filteredFiles, selectedIndex, searchQuery, onFileSelect, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;

    const selectedEl = listEl.children[selectedIndex] as HTMLElement;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleClearAll = useCallback(() => {
    clearRecentFiles();
    onClose();
  }, [onClose]);

  const handleRemoveFile = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      e.stopPropagation();
      removeRecentFile(filePath);
    },
    []
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
      onClick={onClose}
    >
      <div
        className="bg-bolt-elements-background-depth-2 rounded-lg shadow-xl w-[90%] max-w-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="p-3 border-b border-bolt-elements-borderColor">
          <div className="relative">
            <span className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search recent files..."
              className="w-full pl-9 pr-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* File List */}
        <div
          ref={listRef}
          className="flex-1 overflow-auto max-h-[400px] py-2"
          role="listbox"
        >
          {filteredFiles.length === 0 ? (
            <div className="px-4 py-8 text-center text-bolt-elements-textSecondary">
              {recentFiles.length === 0 ? (
                <>
                  <span className="i-ph:files-duotone text-3xl mb-2 block" />
                  <p>No recent files</p>
                  <p className="text-sm text-bolt-elements-textTertiary mt-1">
                    Files you open will appear here
                  </p>
                </>
              ) : (
                <>
                  <span className="i-ph:magnifying-glass text-3xl mb-2 block" />
                  <p>No matching files</p>
                </>
              )}
            </div>
          ) : (
            filteredFiles.map((file, index) => (
              <RecentFileItem
                key={file.path}
                file={file}
                isSelected={index === selectedIndex}
                onClick={() => {
                  onFileSelect(file.path);
                  onClose();
                }}
                onRemove={(e) => handleRemoveFile(e, file.path)}
                onMouseEnter={() => setSelectedIndex(index)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-bolt-elements-borderColor flex items-center justify-between text-xs text-bolt-elements-textTertiary">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-3 rounded text-[10px]">
                Enter
              </kbd>
              <span>Open</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-3 rounded text-[10px]">
                Esc
              </kbd>
              <span>Close</span>
            </span>
          </div>
          {recentFiles.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 text-bolt-elements-textTertiary hover:text-red-400 transition-colors"
            >
              <span className="i-ph:trash" />
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

interface RecentFileItemProps {
  file: RecentFile;
  isSelected: boolean;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
}

const RecentFileItem = memo(function RecentFileItem({
  file,
  isSelected,
  onClick,
  onRemove,
  onMouseEnter,
}: RecentFileItemProps) {
  const iconClass = getFileIcon(file.name);

  // Get the directory path (excluding filename)
  const dirPath = file.path.substring(0, file.path.lastIndexOf('/'));
  // Make path more readable by removing common prefixes
  const displayPath = dirPath
    .replace('/home/project/', '')
    .replace(/^\//, '');

  return (
    <div
      className={classNames(
        'group flex items-center gap-3 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors',
        {
          'bg-blue-500/20 text-bolt-elements-textPrimary': isSelected,
          'hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary':
            !isSelected,
        }
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      role="option"
      aria-selected={isSelected}
    >
      <span className={classNames(iconClass, 'text-lg shrink-0')} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{file.name}</div>
        {displayPath && (
          <div className="text-xs text-bolt-elements-textTertiary truncate">
            {displayPath}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-bolt-elements-textTertiary">
          {formatTimestamp(file.timestamp)}
        </span>
        <button
          onClick={onRemove}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-bolt-elements-background-depth-4 rounded transition-all"
          title="Remove from recent files"
        >
          <span className="i-ph:x text-sm text-bolt-elements-textTertiary hover:text-red-400" />
        </button>
      </div>
    </div>
  );
});

export default RecentFilesPanel;
