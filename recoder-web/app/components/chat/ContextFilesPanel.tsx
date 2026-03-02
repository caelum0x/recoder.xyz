/**
 * ContextFilesPanel - Shows selected context files for AI chat
 * Displays files as pills with remove buttons and token estimates
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useContextPaths } from '~/lib/hooks/useContextPaths';
import { workbenchStore } from '~/lib/stores/workbench';
import { useStore } from '@nanostores/react';
import { formatTokenCount } from '~/lib/hooks/useTokenCount';
import type { FileMap } from '~/lib/stores/files';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ContextFiles');

interface ContextFilesPanelProps {
  className?: string;
  compact?: boolean;
}

// File extension to color mapping
const EXTENSION_COLORS: Record<string, string> = {
  ts: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  tsx: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  js: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  jsx: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  json: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  css: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  scss: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  html: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  md: 'bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary border-recoder-elements-borderColor',
  py: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  rs: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  go: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  sql: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  env: 'bg-yellow-600/20 text-yellow-500 border-yellow-600/30',
};

function getExtensionColor(extension: string): string {
  return EXTENSION_COLORS[extension.toLowerCase()] || 'bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary border-recoder-elements-borderColor';
}

// File picker modal component
const FilePickerModal = memo(function FilePickerModal({
  isOpen,
  onClose,
  onSelect,
  files,
  selectedPaths,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (paths: string[]) => void;
  files: FileMap;
  selectedPaths: string[];
}) {
  const [search, setSearch] = useState('');
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selectedPaths));
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalSelected(new Set(selectedPaths));
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, selectedPaths]);

  // Filter and sort files
  const filteredFiles = Object.entries(files)
    .filter(([path, entry]) => {
      if (entry?.type !== 'file') return false;
      // Filter by search
      if (search && !path.toLowerCase().includes(search.toLowerCase())) return false;
      // Exclude common non-code files
      if (path.includes('node_modules/')) return false;
      if (path.includes('.git/')) return false;
      if (path.endsWith('.lock')) return false;
      if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.gif') || path.endsWith('.svg')) return false;
      return true;
    })
    .map(([path]) => path)
    .sort((a, b) => a.localeCompare(b));

  const toggleFile = (path: string) => {
    setLocalSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onSelect(Array.from(localSelected));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-recoder-elements-background-depth-2 rounded-lg shadow-xl border border-recoder-elements-borderColor w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-recoder-elements-borderColor">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-recoder-elements-textPrimary">
              Add Files to Context
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary"
            >
              <div className="i-ph:x text-xl" />
            </button>
          </div>
          {/* Search input */}
          <div className="relative">
            <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-recoder-elements-textSecondary" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-9 pr-4 py-2 bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:border-recoder-elements-borderColorActive"
            />
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-8 text-recoder-elements-textSecondary">
              <div className="i-ph:folder-open text-4xl mx-auto mb-2 opacity-50" />
              <p>{search ? 'No files match your search' : 'No files available'}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredFiles.map((path) => {
                const isSelected = localSelected.has(path);
                const name = path.split('/').pop() || path;
                const dir = path.slice(0, path.lastIndexOf('/')) || '/';

                return (
                  <button
                    key={path}
                    onClick={() => toggleFile(path)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left ${
                      isSelected
                        ? 'bg-blue-500/20 border border-blue-500/30'
                        : 'hover:bg-recoder-elements-background-depth-3 border border-transparent'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isSelected
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-recoder-elements-borderColor'
                    }`}>
                      {isSelected && <div className="i-ph:check text-white text-xs" />}
                    </div>
                    <div className="i-ph:file-duotone text-recoder-elements-textSecondary" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-recoder-elements-textPrimary truncate">{name}</div>
                      <div className="text-xs text-recoder-elements-textTertiary truncate">{dir}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-recoder-elements-borderColor flex items-center justify-between">
          <div className="text-sm text-recoder-elements-textSecondary">
            {localSelected.size} file{localSelected.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-recoder-elements-borderColor text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600"
            >
              Add to Context
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export const ContextFilesPanel = memo(function ContextFilesPanel({
  className = '',
  compact = false,
}: ContextFilesPanelProps) {
  const {
    contextPaths,
    contextFiles,
    totalTokens,
    removeContextPath,
    clearContextPaths,
    addContextPaths,
    setFileContent,
  } = useContextPaths();

  const files = useStore(workbenchStore.files);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Load file contents for token estimation
  useEffect(() => {
    const loadContents = async () => {
      for (const path of contextPaths) {
        try {
          const content = await workbenchStore.readFileContent(path);
          if (content) {
            setFileContent(path, content);
          }
        } catch (e) {
          logger.warn(`Failed to load content for ${path}:`, e);
        }
      }
    };

    if (contextPaths.length > 0) {
      loadContents();
    }
  }, [contextPaths, setFileContent]);

  const handleAddFiles = useCallback((paths: string[]) => {
    addContextPaths(paths);
  }, [addContextPaths]);

  // Don't render if no context files and compact mode
  if (compact && contextPaths.length === 0) {
    return null;
  }

  return (
    <>
      <div className={`${className}`}>
        {contextPaths.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 p-2 bg-recoder-elements-background-depth-2 border-b border-recoder-elements-borderColor">
            {/* Context label */}
            <div className="flex items-center gap-1 text-xs text-recoder-elements-textSecondary">
              <div className="i-ph:files-duotone" />
              <span>Context:</span>
            </div>

            {/* File pills */}
            {contextFiles.map((file) => (
              <div
                key={file.path}
                className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs ${getExtensionColor(file.extension)}`}
                title={`${file.path} (~${formatTokenCount(file.tokenEstimate)} tokens)`}
              >
                <span className="max-w-[120px] truncate">{file.name}</span>
                {file.tokenEstimate > 0 && (
                  <span className="opacity-60 text-[10px]">
                    {formatTokenCount(file.tokenEstimate)}
                  </span>
                )}
                <button
                  onClick={() => removeContextPath(file.path)}
                  className="ml-0.5 p-0.5 rounded-full hover:bg-recoder-elements-background-depth-3"
                  title="Remove from context"
                >
                  <div className="i-ph:x text-xs" />
                </button>
              </div>
            ))}

            {/* Add more button */}
            <button
              onClick={() => setIsPickerOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-recoder-elements-borderColor text-xs text-recoder-elements-textSecondary hover:border-recoder-elements-borderColorActive hover:text-recoder-elements-textPrimary"
            >
              <div className="i-ph:plus" />
              <span>Add</span>
            </button>

            {/* Total tokens & clear */}
            {totalTokens > 0 && (
              <>
                <div className="flex-1" />
                <div className="text-xs text-recoder-elements-textTertiary">
                  ~{formatTokenCount(totalTokens)} tokens
                </div>
                <button
                  onClick={clearContextPaths}
                  className="p-1 rounded hover:bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary"
                  title="Clear all context files"
                >
                  <div className="i-ph:x-circle text-sm" />
                </button>
              </>
            )}
          </div>
        ) : (
          /* Add files button when empty */
          !compact && (
            <div className="p-2 bg-recoder-elements-background-depth-2 border-b border-recoder-elements-borderColor">
              <button
                onClick={() => setIsPickerOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-recoder-elements-borderColor text-xs text-recoder-elements-textSecondary hover:border-recoder-elements-borderColorActive hover:text-recoder-elements-textPrimary w-full justify-center"
              >
                <div className="i-ph:files-duotone" />
                <span>Add files to context</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* File picker modal */}
      <FilePickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleAddFiles}
        files={files}
        selectedPaths={contextPaths}
      />
    </>
  );
});

// Compact inline version for use in the chat input area
export const ContextFilesPill = memo(function ContextFilesPill() {
  const { contextPaths, totalTokens } = useContextPaths();

  if (contextPaths.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs"
      title={`${contextPaths.length} files in context (~${formatTokenCount(totalTokens)} tokens)`}
    >
      <div className="i-ph:files-duotone" />
      <span>{contextPaths.length} files</span>
      {totalTokens > 0 && (
        <span className="opacity-60">({formatTokenCount(totalTokens)})</span>
      )}
    </div>
  );
});

export default ContextFilesPanel;
