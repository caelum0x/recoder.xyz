/**
 * ContextManager - UI for managing AI context files
 *
 * Features:
 * - File checklist for manual selection
 * - Token usage display with budget indicator
 * - Auto-context toggle and mode selection
 * - Preview context button
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  aiContextSettingsStore,
  selectedFilesStore,
  autoDetectedFilesStore,
  activeFileStore,
  contextPreviewOpen,
  autoDetectLoading,
  autoDetectError,
  type AIContextFile,
  type AutoContextMode,
  updateAIContextSettings,
  addSelectedFile,
  removeSelectedFile,
  clearSelectedFiles,
  toggleFileInclusion,
  toggleAutoContext,
  setAutoContextMode,
  setTokenBudget,
  toggleContextPreview,
  getAllContextFiles,
  getTotalTokens,
  getBudgetUsagePercent,
  isBudgetExceeded,
  isApproachingBudget,
} from '~/lib/stores/ai-context';
import {
  autoDetectContextFiles,
  generateContextPreview,
  refreshAutoContext,
  clearAllContext,
  estimateFileTokens,
} from '~/lib/services/ai-context-manager';
import { workbenchStore } from '~/lib/stores/workbench';
import type { FileMap } from '~/lib/stores/files';
import { formatTokenCount } from '~/lib/hooks/useTokenCount';

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
};

function getExtensionColor(extension: string): string {
  return EXTENSION_COLORS[extension.toLowerCase()] || 'bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary border-recoder-elements-borderColor';
}

// Source badge colors
const SOURCE_COLORS: Record<AIContextFile['source'], string> = {
  manual: 'bg-purple-500/20 text-purple-400',
  'auto-import': 'bg-green-500/20 text-green-400',
  'auto-importedBy': 'bg-cyan-500/20 text-cyan-400',
  'auto-test': 'bg-orange-500/20 text-orange-400',
  'auto-config': 'bg-yellow-500/20 text-yellow-400',
  'auto-type': 'bg-blue-500/20 text-blue-400',
  'auto-smart': 'bg-indigo-500/20 text-indigo-400',
};

const SOURCE_LABELS: Record<AIContextFile['source'], string> = {
  manual: 'Manual',
  'auto-import': 'Import',
  'auto-importedBy': 'Imported by',
  'auto-test': 'Test',
  'auto-config': 'Config',
  'auto-type': 'Type',
  'auto-smart': 'Smart',
};

interface ContextManagerProps {
  projectId: string | null;
  className?: string;
  compact?: boolean;
}

// Token budget indicator component
const TokenBudgetIndicator = memo(function TokenBudgetIndicator() {
  const settings = useStore(aiContextSettingsStore);
  const totalTokens = getTotalTokens();
  const usagePercent = getBudgetUsagePercent();
  const exceeded = isBudgetExceeded();
  const approaching = isApproachingBudget();

  const barColor = exceeded
    ? 'bg-red-500'
    : approaching
      ? 'bg-yellow-500'
      : 'bg-green-500';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-recoder-elements-textSecondary">Token Budget</span>
        <span className={exceeded ? 'text-red-400' : approaching ? 'text-yellow-400' : 'text-recoder-elements-textSecondary'}>
          {formatTokenCount(totalTokens)} / {formatTokenCount(settings.tokenBudget)}
        </span>
      </div>
      <div className="h-1.5 bg-recoder-elements-background-depth-2 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${Math.min(100, usagePercent)}%` }}
        />
      </div>
      {exceeded && (
        <p className="text-xs text-red-400">
          Budget exceeded. Some files will be excluded.
        </p>
      )}
    </div>
  );
});

// File item in the list
const FileItem = memo(function FileItem({
  file,
  onToggle,
  onRemove,
  showSource = true,
}: {
  file: AIContextFile;
  onToggle: (path: string) => void;
  onRemove: (path: string) => void;
  showSource?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        file.included
          ? 'bg-recoder-elements-background-depth-2'
          : 'bg-recoder-elements-background-depth-2 opacity-50'
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(file.path)}
        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
          file.included
            ? 'bg-blue-500 border-blue-500'
            : 'border-recoder-elements-borderColor hover:border-blue-400'
        }`}
      >
        {file.included && <div className="i-ph:check text-white text-xs" />}
      </button>

      {/* File icon and name */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className={`w-5 h-5 rounded flex items-center justify-center text-xs ${getExtensionColor(file.extension)}`}>
          <div className="i-ph:file-duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-recoder-elements-textPrimary truncate" title={file.path}>
            {file.name}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-recoder-elements-textTertiary truncate">
              {file.path.split('/').slice(0, -1).join('/')}
            </span>
          </div>
        </div>
      </div>

      {/* Source badge */}
      {showSource && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_COLORS[file.source]}`}>
          {SOURCE_LABELS[file.source]}
        </span>
      )}

      {/* Token count */}
      <span className="text-xs text-recoder-elements-textTertiary whitespace-nowrap">
        ~{formatTokenCount(file.tokenEstimate)}
      </span>

      {/* Remove button (only for manual files) */}
      {file.source === 'manual' && (
        <button
          onClick={() => onRemove(file.path)}
          className="p-1 rounded hover:bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary hover:text-red-400"
          title="Remove from context"
        >
          <div className="i-ph:x text-sm" />
        </button>
      )}
    </div>
  );
});

// File picker modal
const FilePickerModal = memo(function FilePickerModal({
  isOpen,
  onClose,
  onSelect,
  files,
  projectId,
  existingPaths,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (paths: string[]) => void;
  files: FileMap;
  projectId: string | null;
  existingPaths: string[];
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [estimating, setEstimating] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<Map<string, number>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelected(new Set());
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Filter files
  const filteredFiles = Object.entries(files)
    .filter(([path, entry]) => {
      if (entry?.type !== 'file') return false;
      if (search && !path.toLowerCase().includes(search.toLowerCase())) return false;
      if (path.includes('node_modules/')) return false;
      if (path.includes('.git/')) return false;
      if (path.endsWith('.lock')) return false;
      if (existingPaths.includes(path)) return false;
      return true;
    })
    .map(([path]) => path)
    .sort((a, b) => a.localeCompare(b));

  const toggleFile = useCallback(async (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        // Estimate tokens for newly selected file
        if (projectId && !estimates.has(path)) {
          setEstimating(path);
          estimateFileTokens(projectId, path).then(tokens => {
            setEstimates(prev => new Map(prev).set(path, tokens));
            setEstimating(null);
          });
        }
      }
      return next;
    });
  }, [projectId, estimates]);

  const handleConfirm = useCallback(() => {
    onSelect(Array.from(selected));
    onClose();
  }, [selected, onSelect, onClose]);

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
              className="p-1 rounded hover:bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary"
            >
              <div className="i-ph:x text-xl" />
            </button>
          </div>
          <div className="relative">
            <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-recoder-elements-textSecondary" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-9 pr-4 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:border-recoder-elements-borderColorActive"
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
                const isSelected = selected.has(path);
                const name = path.split('/').pop() || path;
                const dir = path.slice(0, path.lastIndexOf('/')) || '/';
                const tokenEst = estimates.get(path);

                return (
                  <button
                    key={path}
                    onClick={() => toggleFile(path)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left ${
                      isSelected
                        ? 'bg-blue-500/20 border border-blue-500/30'
                        : 'hover:bg-recoder-elements-background-depth-2 border border-transparent'
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
                    {estimating === path && (
                      <div className="i-ph:spinner-gap animate-spin text-recoder-elements-textTertiary" />
                    )}
                    {tokenEst !== undefined && (
                      <span className="text-xs text-recoder-elements-textTertiary">
                        ~{formatTokenCount(tokenEst)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-recoder-elements-borderColor flex items-center justify-between">
          <div className="text-sm text-recoder-elements-textSecondary">
            {selected.size} file{selected.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-recoder-elements-borderColor text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-2"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="px-4 py-2 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add to Context
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// Context preview modal
const ContextPreviewModal = memo(function ContextPreviewModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const preview = generateContextPreview();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-recoder-elements-background-depth-2 rounded-lg shadow-xl border border-recoder-elements-borderColor w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-recoder-elements-borderColor">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-recoder-elements-textPrimary">
              Context Preview
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary"
            >
              <div className="i-ph:x text-xl" />
            </button>
          </div>

          {/* Stats */}
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="i-ph:files-duotone text-recoder-elements-textSecondary" />
              <span className="text-recoder-elements-textPrimary">{preview.files.length} files</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="i-ph:hash text-recoder-elements-textSecondary" />
              <span className={preview.budgetExceeded ? 'text-red-400' : 'text-recoder-elements-textPrimary'}>
                ~{formatTokenCount(preview.totalTokens)} tokens
              </span>
            </div>
            {preview.excludedFiles.length > 0 && (
              <div className="flex items-center gap-2 text-yellow-400">
                <div className="i-ph:warning" />
                <span>{preview.excludedFiles.length} files excluded (over budget)</span>
              </div>
            )}
          </div>

          {/* Breakdown */}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {preview.breakdown.manual > 0 && (
              <span className={`px-2 py-0.5 rounded ${SOURCE_COLORS.manual}`}>
                {preview.breakdown.manual} manual
              </span>
            )}
            {preview.breakdown.autoImport > 0 && (
              <span className={`px-2 py-0.5 rounded ${SOURCE_COLORS['auto-import']}`}>
                {preview.breakdown.autoImport} imports
              </span>
            )}
            {preview.breakdown.autoImportedBy > 0 && (
              <span className={`px-2 py-0.5 rounded ${SOURCE_COLORS['auto-importedBy']}`}>
                {preview.breakdown.autoImportedBy} imported by
              </span>
            )}
            {preview.breakdown.autoType > 0 && (
              <span className={`px-2 py-0.5 rounded ${SOURCE_COLORS['auto-type']}`}>
                {preview.breakdown.autoType} types
              </span>
            )}
            {preview.breakdown.autoConfig > 0 && (
              <span className={`px-2 py-0.5 rounded ${SOURCE_COLORS['auto-config']}`}>
                {preview.breakdown.autoConfig} configs
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <pre className="text-xs text-recoder-elements-textSecondary whitespace-pre-wrap font-mono bg-recoder-elements-background-depth-2 p-4 rounded-lg overflow-x-auto">
            {preview.previewText}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-recoder-elements-borderColor flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

// Settings panel
const SettingsPanel = memo(function SettingsPanel({
  projectId,
}: {
  projectId: string | null;
}) {
  const settings = useStore(aiContextSettingsStore);
  const loading = useStore(autoDetectLoading);
  const error = useStore(autoDetectError);

  const handleRefresh = useCallback(async () => {
    if (projectId) {
      await refreshAutoContext(projectId);
    }
  }, [projectId]);

  return (
    <div className="p-3 border-b border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 space-y-3">
      {/* Auto-context toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-recoder-elements-textPrimary">Auto-context</span>
          <button
            onClick={() => toggleAutoContext()}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              settings.autoContextEnabled ? 'bg-blue-500' : 'bg-recoder-elements-background-depth-3'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                settings.autoContextEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {settings.autoContextEnabled && (
          <button
            onClick={handleRefresh}
            disabled={loading || !projectId}
            className="flex items-center gap-1 text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary disabled:opacity-50"
          >
            <div className={`i-ph:arrows-clockwise ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {/* Auto-context mode */}
      {settings.autoContextEnabled && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-recoder-elements-textSecondary">Mode:</span>
          <div className="flex gap-1">
            {(['imports', 'related', 'smart'] as AutoContextMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setAutoContextMode(mode)}
                className={`px-2 py-1 text-xs rounded ${
                  settings.autoContextMode === mode
                    ? 'bg-blue-500 text-white'
                    : 'bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Token budget slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-recoder-elements-textSecondary">Max tokens:</span>
          <span className="text-recoder-elements-textPrimary">{formatTokenCount(settings.tokenBudget)}</span>
        </div>
        <input
          type="range"
          min="10000"
          max="200000"
          step="5000"
          value={settings.tokenBudget}
          onChange={(e) => setTokenBudget(parseInt(e.target.value))}
          className="w-full h-1.5 bg-recoder-elements-background-depth-2 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="text-xs text-red-400 flex items-center gap-1">
          <div className="i-ph:warning" />
          {error}
        </div>
      )}
    </div>
  );
});

// Main component
export const ContextManager = memo(function ContextManager({
  projectId,
  className = '',
  compact = false,
}: ContextManagerProps) {
  const settings = useStore(aiContextSettingsStore);
  const selectedFiles = useStore(selectedFilesStore);
  const autoDetectedFiles = useStore(autoDetectedFilesStore);
  const activeFile = useStore(activeFileStore);
  const isPreviewOpen = useStore(contextPreviewOpen);
  const loading = useStore(autoDetectLoading);
  const files = useStore(workbenchStore.files);
  const currentFile = useStore(workbenchStore.selectedFile);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Update active file when current file changes
  useEffect(() => {
    if (currentFile && currentFile !== activeFile) {
      activeFileStore.set(currentFile);
    }
  }, [currentFile, activeFile]);

  // Auto-detect on active file change
  useEffect(() => {
    if (projectId && activeFile && settings.autoContextEnabled) {
      autoDetectContextFiles(projectId, activeFile);
    }
  }, [projectId, activeFile, settings.autoContextEnabled, settings.autoContextMode]);

  const allContextFiles = getAllContextFiles();
  const existingPaths = allContextFiles.map(f => f.path);

  const handleAddFiles = useCallback(async (paths: string[]) => {
    for (const path of paths) {
      // Read file content
      const content = await workbenchStore.readFileContent(path);
      if (content) {
        const name = path.split('/').pop() || path;
        const extension = name.includes('.') ? name.split('.').pop() || '' : '';
        addSelectedFile({
          path,
          name,
          extension,
          content,
          tokenEstimate: Math.ceil(content.length / 4),
          source: 'manual',
          priority: 100,
          included: true,
        });
      }
    }
  }, []);

  const handleToggle = useCallback((path: string) => {
    toggleFileInclusion(path);
  }, []);

  const handleRemove = useCallback((path: string) => {
    removeSelectedFile(path);
  }, []);

  // Compact view for chat input area
  if (compact) {
    if (allContextFiles.length === 0) return null;

    const totalTokens = getTotalTokens();

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={() => toggleContextPreview()}
          className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs hover:bg-blue-500/30"
          title={`${allContextFiles.length} files (~${formatTokenCount(totalTokens)} tokens)`}
        >
          <div className="i-ph:files-duotone" />
          <span>{allContextFiles.length}</span>
          <span className="opacity-60">({formatTokenCount(totalTokens)})</span>
        </button>

        <ContextPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => toggleContextPreview()}
        />
      </div>
    );
  }

  return (
    <>
      <div className={`bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor rounded-lg overflow-hidden ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-recoder-elements-borderColor">
          <div className="flex items-center gap-2">
            <div className="i-ph:brain text-recoder-elements-textSecondary" />
            <h3 className="text-sm font-medium text-recoder-elements-textPrimary">AI Context</h3>
            {loading && <div className="i-ph:spinner-gap animate-spin text-blue-400 text-sm" />}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-1.5 rounded hover:bg-recoder-elements-background-depth-2 ${
                isSettingsOpen ? 'text-blue-400' : 'text-recoder-elements-textSecondary'
              }`}
              title="Settings"
            >
              <div className="i-ph:gear text-sm" />
            </button>
            <button
              onClick={() => toggleContextPreview()}
              className="p-1.5 rounded hover:bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary"
              title="Preview context"
            >
              <div className="i-ph:eye text-sm" />
            </button>
            <button
              onClick={() => clearAllContext()}
              className="p-1.5 rounded hover:bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary hover:text-red-400"
              title="Clear all context"
            >
              <div className="i-ph:trash text-sm" />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {isSettingsOpen && <SettingsPanel projectId={projectId} />}

        {/* Token budget indicator */}
        <div className="p-3 border-b border-recoder-elements-borderColor">
          <TokenBudgetIndicator />
        </div>

        {/* File list */}
        <div className="max-h-64 overflow-y-auto">
          {allContextFiles.length === 0 ? (
            <div className="p-4 text-center text-recoder-elements-textSecondary">
              <div className="i-ph:files-duotone text-3xl mx-auto mb-2 opacity-50" />
              <p className="text-sm">No files in context</p>
              <p className="text-xs mt-1">
                {settings.autoContextEnabled
                  ? 'Open a file to auto-detect related files'
                  : 'Click "Add Files" to select files'}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {allContextFiles.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-recoder-elements-borderColor">
          <button
            onClick={() => setIsPickerOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-recoder-elements-borderColor text-sm text-recoder-elements-textSecondary hover:border-recoder-elements-borderColor hover:text-recoder-elements-textPrimary"
          >
            <div className="i-ph:plus" />
            Add Files
          </button>
        </div>
      </div>

      {/* Modals */}
      <FilePickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleAddFiles}
        files={files}
        projectId={projectId}
        existingPaths={existingPaths}
      />

      <ContextPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => toggleContextPreview()}
      />
    </>
  );
});

// Compact pill for use in chat input
export const ContextManagerPill = memo(function ContextManagerPill({
  projectId,
}: {
  projectId: string | null;
}) {
  return <ContextManager projectId={projectId} compact />;
});

export default ContextManager;
