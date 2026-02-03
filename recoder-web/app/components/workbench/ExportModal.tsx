/**
 * Export Modal Component
 * Allows users to configure and execute project exports
 */

import { useStore } from '@nanostores/react';
import { memo, useCallback, useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import {
  exportModalOpen,
  closeExportModal,
  exportOptions,
  exportProgress,
  exportHistory,
  updateExportOptions,
  resetExportOptions,
  toggleIncludeEnvExample,
  toggleIncludeReadme,
  addExcludePattern,
  removeExcludePattern,
  setSelectedFiles,
  clearSelectedFiles,
  applyExportPreset,
  resetExportProgress,
  DEFAULT_EXCLUDE_PATTERNS,
  type ExportOptions,
  type ExportProgress,
  type ExportHistoryEntry,
} from '~/lib/stores/export';
import {
  exportProject,
  exportFromMemory,
  downloadExportResult,
  type ExportResult,
} from '~/lib/services/project-export';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

interface ExportModalProps {
  projectId: string | null;
}

export const ExportModal = memo(({ projectId }: ExportModalProps) => {
  const isOpen = useStore(exportModalOpen);
  const options = useStore(exportOptions);
  const progress = useStore(exportProgress);
  const history = useStore(exportHistory);
  const files = useStore(workbenchStore.files);

  const [activeTab, setActiveTab] = useState<'options' | 'files' | 'history'>('options');
  const [newExcludePattern, setNewExcludePattern] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Get list of available files for selective export
  const availableFiles = useMemo(() => {
    return Object.entries(files)
      .filter(([_, file]) => file?.type === 'file')
      .map(([path]) => path)
      .sort();
  }, [files]);

  const handleClose = useCallback(() => {
    if (!isExporting) {
      closeExportModal();
      resetExportProgress();
    }
  }, [isExporting]);

  const handleExport = useCallback(async () => {
    if (isExporting) return;

    setIsExporting(true);
    try {
      let result: ExportResult;

      if (projectId) {
        // Try to export from Docker container
        result = await exportProject(projectId, options);

        // If Docker export fails, fall back to memory export
        if (!result.success && Object.keys(files).length > 0) {
          toast.info('Falling back to in-memory export...');
          result = await exportFromMemory(files as any, options);
        }
      } else {
        // No project ID, export from memory
        result = await exportFromMemory(files as any, options);
      }

      if (result.success) {
        downloadExportResult(result);
        toast.success(
          `Exported ${result.fileCount} files (${formatBytes(result.sizeBytes || 0)})`
        );
        setTimeout(() => {
          closeExportModal();
          resetExportProgress();
        }, 1500);
      } else {
        toast.error(`Export failed: ${result.error}`);
      }
    } catch (error) {
      toast.error('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  }, [projectId, options, files, isExporting]);

  const handleAddExcludePattern = useCallback(() => {
    if (newExcludePattern.trim()) {
      addExcludePattern(newExcludePattern.trim());
      setNewExcludePattern('');
    }
  }, [newExcludePattern]);

  const handleToggleFile = useCallback((filePath: string) => {
    const current = options.selectedFiles;
    if (current.includes(filePath)) {
      setSelectedFiles(current.filter(f => f !== filePath));
    } else {
      setSelectedFiles([...current, filePath]);
    }
  }, [options.selectedFiles]);

  const handleSelectAll = useCallback(() => {
    setSelectedFiles([...availableFiles]);
  }, [availableFiles]);

  const handleSelectNone = useCallback(() => {
    clearSelectedFiles();
  }, []);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div
          className="bg-bolt-elements-background-depth-2 rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col border border-bolt-elements-borderColor"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-bolt-elements-borderColor">
            <h2 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
              <div className="i-ph:export text-xl" />
              Export Project
            </h2>
            <button
              onClick={handleClose}
              disabled={isExporting}
              className="p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary rounded transition-colors disabled:opacity-50"
            >
              <div className="i-ph:x text-xl" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-bolt-elements-borderColor">
            <TabButton
              active={activeTab === 'options'}
              onClick={() => setActiveTab('options')}
              icon="i-ph:sliders"
              label="Options"
            />
            <TabButton
              active={activeTab === 'files'}
              onClick={() => setActiveTab('files')}
              icon="i-ph:files"
              label="Files"
              badge={options.selectedFiles.length > 0 ? options.selectedFiles.length : undefined}
            />
            <TabButton
              active={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              icon="i-ph:clock-counter-clockwise"
              label="History"
            />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'options' && (
              <OptionsTab
                options={options}
                newExcludePattern={newExcludePattern}
                setNewExcludePattern={setNewExcludePattern}
                onAddExcludePattern={handleAddExcludePattern}
              />
            )}
            {activeTab === 'files' && (
              <FilesTab
                files={availableFiles}
                selectedFiles={options.selectedFiles}
                onToggleFile={handleToggleFile}
                onSelectAll={handleSelectAll}
                onSelectNone={handleSelectNone}
              />
            )}
            {activeTab === 'history' && <HistoryTab history={history} />}
          </div>

          {/* Progress */}
          {progress.status !== 'idle' && progress.status !== 'complete' && (
            <div className="px-6 py-3 border-t border-bolt-elements-borderColor">
              <ProgressIndicator progress={progress} />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-bolt-elements-borderColor">
            <button
              onClick={resetExportOptions}
              className="px-4 py-2 text-sm text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors"
              disabled={isExporting}
            >
              Reset to Defaults
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary rounded-md transition-colors"
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting || availableFiles.length === 0}
                className={classNames(
                  'px-4 py-2 text-sm rounded-md transition-colors flex items-center gap-2',
                  isExporting
                    ? 'bg-blue-500/50 text-white cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                )}
              >
                {isExporting ? (
                  <>
                    <div className="i-ph:spinner animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <div className="i-ph:download-simple" />
                    Export ZIP
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

// ==================== Sub-components ====================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  badge?: number;
}

const TabButton = memo(({ active, onClick, icon, label, badge }: TabButtonProps) => (
  <button
    onClick={onClick}
    className={classNames(
      'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative',
      active
        ? 'text-blue-500 border-b-2 border-blue-500 -mb-px'
        : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
    )}
  >
    <div className={icon} />
    {label}
    {badge !== undefined && (
      <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
        {badge}
      </span>
    )}
  </button>
));

interface OptionsTabProps {
  options: ExportOptions;
  newExcludePattern: string;
  setNewExcludePattern: (value: string) => void;
  onAddExcludePattern: () => void;
}

const OptionsTab = memo(({
  options,
  newExcludePattern,
  setNewExcludePattern,
  onAddExcludePattern,
}: OptionsTabProps) => (
  <div className="space-y-6">
    {/* Project Name */}
    <div>
      <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
        Project Name
      </label>
      <input
        type="text"
        value={options.projectName}
        onChange={(e) => updateExportOptions({ projectName: e.target.value })}
        className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="my-project"
      />
    </div>

    {/* Presets */}
    <div>
      <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
        Quick Presets
      </label>
      <div className="flex gap-2">
        <PresetButton
          label="Full Export"
          onClick={() => applyExportPreset('full')}
        />
        <PresetButton
          label="Source Only"
          onClick={() => applyExportPreset('source-only')}
        />
        <PresetButton
          label="Minimal"
          onClick={() => applyExportPreset('minimal')}
        />
      </div>
    </div>

    {/* Toggle Options */}
    <div className="space-y-3">
      <ToggleOption
        label="Include .env.example"
        description="Create sanitized .env.example from your .env file"
        checked={options.includeEnvExample}
        onChange={toggleIncludeEnvExample}
      />
      <ToggleOption
        label="Include README"
        description="Auto-generate README.md if not present"
        checked={options.includeReadme}
        onChange={toggleIncludeReadme}
      />
      <ToggleOption
        label="Preserve Directory Structure"
        description="Maintain folder hierarchy in the ZIP"
        checked={options.preserveStructure}
        onChange={() => updateExportOptions({ preserveStructure: !options.preserveStructure })}
      />
    </div>

    {/* Exclude Patterns */}
    <div>
      <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
        Exclude Patterns
      </label>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={newExcludePattern}
          onChange={(e) => setNewExcludePattern(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAddExcludePattern()}
          className="flex-1 px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          placeholder="e.g., *.test.ts, docs/**"
        />
        <button
          onClick={onAddExcludePattern}
          className="px-3 py-2 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary transition-colors"
        >
          <div className="i-ph:plus" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
        {options.excludePatterns.map((pattern) => (
          <span
            key={pattern}
            className="inline-flex items-center gap-1 px-2 py-1 bg-bolt-elements-background-depth-2 rounded text-sm text-bolt-elements-textTertiary"
          >
            {pattern}
            <button
              onClick={() => removeExcludePattern(pattern)}
              className="hover:text-red-500 transition-colors"
            >
              <div className="i-ph:x text-xs" />
            </button>
          </span>
        ))}
      </div>
    </div>
  </div>
));

interface FilesTabProps {
  files: string[];
  selectedFiles: string[];
  onToggleFile: (path: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

const FilesTab = memo(({
  files,
  selectedFiles,
  onToggleFile,
  onSelectAll,
  onSelectNone,
}: FilesTabProps) => {
  const isSelective = selectedFiles.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-bolt-elements-textTertiary">
          {isSelective
            ? `${selectedFiles.length} of ${files.length} files selected`
            : `All ${files.length} files will be exported (based on filters)`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={onSelectNone}
            className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
          >
            Clear Selection
          </button>
        </div>
      </div>

      <div className="border border-bolt-elements-borderColor rounded-md max-h-72 overflow-y-auto">
        {files.length === 0 ? (
          <div className="p-4 text-center text-bolt-elements-textTertiary">
            No files available
          </div>
        ) : (
          files.map((path) => {
            const isSelected = !isSelective || selectedFiles.includes(path);
            const displayPath = path.startsWith('/') ? path.slice(1) : path;

            return (
              <label
                key={path}
                className={classNames(
                  'flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-bolt-elements-background-depth-2 transition-colors border-b border-bolt-elements-borderColor last:border-b-0',
                  isSelected ? 'bg-bolt-elements-background-depth-2' : 'opacity-60'
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected && isSelective}
                  onChange={() => onToggleFile(path)}
                  className="rounded border-bolt-elements-borderColor text-blue-500 focus:ring-blue-500"
                />
                <div className="i-ph:file text-bolt-elements-textTertiary" />
                <span className="text-sm text-bolt-elements-textPrimary truncate flex-1">
                  {displayPath}
                </span>
              </label>
            );
          })
        )}
      </div>

      <p className="text-xs text-bolt-elements-textTertiary">
        Tip: Leave all unchecked to export all files (respecting exclude patterns)
      </p>
    </div>
  );
});

interface HistoryTabProps {
  history: ExportHistoryEntry[];
}

const HistoryTab = memo(({ history }: HistoryTabProps) => (
  <div className="space-y-3">
    {history.length === 0 ? (
      <div className="text-center py-8 text-bolt-elements-textTertiary">
        <div className="i-ph:archive text-4xl mx-auto mb-2 opacity-50" />
        <p>No export history yet</p>
      </div>
    ) : (
      history.map((entry) => (
        <div
          key={entry.id}
          className="p-3 bg-bolt-elements-background-depth-2 rounded-md border border-bolt-elements-borderColor"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-bolt-elements-textPrimary">
              {entry.projectName}.zip
            </span>
            <span className="text-xs text-bolt-elements-textTertiary">
              {formatDate(entry.timestamp)}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-bolt-elements-textTertiary">
            <span className="flex items-center gap-1">
              <div className="i-ph:files" />
              {entry.fileCount} files
            </span>
            <span className="flex items-center gap-1">
              <div className="i-ph:database" />
              {formatBytes(entry.sizeBytes)}
            </span>
            <span className="flex items-center gap-1">
              <div className="i-ph:timer" />
              {entry.durationMs}ms
            </span>
          </div>
        </div>
      ))
    )}
  </div>
));

interface PresetButtonProps {
  label: string;
  onClick: () => void;
}

const PresetButton = memo(({ label, onClick }: PresetButtonProps) => (
  <button
    onClick={onClick}
    className="px-3 py-1.5 text-sm bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary transition-colors"
  >
    {label}
  </button>
));

interface ToggleOptionProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

const ToggleOption = memo(({ label, description, checked, onChange }: ToggleOptionProps) => (
  <label className="flex items-start gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="mt-0.5 rounded border-bolt-elements-borderColor text-blue-500 focus:ring-blue-500"
    />
    <div>
      <span className="text-sm font-medium text-bolt-elements-textPrimary">{label}</span>
      <p className="text-xs text-bolt-elements-textTertiary">{description}</p>
    </div>
  </label>
));

interface ProgressIndicatorProps {
  progress: ExportProgress;
}

const ProgressIndicator = memo(({ progress }: ProgressIndicatorProps) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-sm">
      <span className="text-bolt-elements-textTertiary capitalize">{progress.status}...</span>
      <span className="text-bolt-elements-textPrimary">{progress.percentage}%</span>
    </div>
    <div className="h-2 bg-bolt-elements-background-depth-2 rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-blue-500"
        initial={{ width: 0 }}
        animate={{ width: `${progress.percentage}%` }}
        transition={{ ease: 'easeOut' }}
      />
    </div>
    {progress.currentFile && (
      <p className="text-xs text-bolt-elements-textTertiary truncate">
        {progress.currentFile}
      </p>
    )}
  </div>
));

// ==================== Utilities ====================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString();
}
