/**
 * Export Button Component
 * Triggers the export modal or quick export
 */

import { memo, useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { openExportModal, exportProgress, setExportProjectName } from '~/lib/stores/export';
import { quickExport, quickExportFromMemory } from '~/lib/services/project-export';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

interface ExportButtonProps {
  className?: string;
  showLabel?: boolean;
  /** If true, shows dropdown with options */
  withDropdown?: boolean;
}

export const ExportButton = memo(({ className, showLabel = true, withDropdown = true }: ExportButtonProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const files = useStore(workbenchStore.files);
  const progress = useStore(exportProgress);
  const [showDropdown, setShowDropdown] = useState(false);

  const isExporting = progress.status !== 'idle' && progress.status !== 'complete' && progress.status !== 'error';
  const hasFiles = Object.keys(files).length > 0;

  const handleQuickExport = useCallback(async () => {
    setShowDropdown(false);

    if (!hasFiles) {
      toast.error('No files to export');
      return;
    }

    try {
      if (projectId) {
        await quickExport(projectId);
      } else {
        await quickExportFromMemory(files as any);
      }
    } catch (error) {
      toast.error('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }, [projectId, files, hasFiles]);

  const handleOpenModal = useCallback(() => {
    setShowDropdown(false);

    // Try to get project name from package.json
    const packageJsonFile = Object.entries(files).find(
      ([path]) => path === '/package.json' || path === 'package.json'
    );
    if (packageJsonFile && packageJsonFile[1]?.type === 'file' && 'content' in packageJsonFile[1]) {
      try {
        const pkg = JSON.parse((packageJsonFile[1] as any).content);
        if (pkg.name) {
          setExportProjectName(pkg.name);
        }
      } catch {
        // Ignore parse errors
      }
    }

    openExportModal();
  }, [files]);

  const handleClick = useCallback(() => {
    if (withDropdown) {
      setShowDropdown(!showDropdown);
    } else {
      handleOpenModal();
    }
  }, [withDropdown, showDropdown, handleOpenModal]);

  return (
    <div className={classNames('relative', className)}>
      <PanelHeaderButton
        onClick={handleClick}
        disabled={isExporting || !hasFiles}
        className="text-sm"
        title="Export project as ZIP"
      >
        <div
          className={classNames(
            isExporting ? 'i-ph:spinner animate-spin' : 'i-ph:export'
          )}
        />
        {showLabel ? (isExporting ? 'Exporting...' : 'Export') : ''}
        {withDropdown && !isExporting ? (
          <div className="i-ph:caret-down text-xs ml-1" />
        ) : <></>}
      </PanelHeaderButton>

      {/* Dropdown Menu */}
      {withDropdown && showDropdown && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 top-full mt-1 z-50 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md shadow-lg overflow-hidden min-w-[180px]">
            <button
              onClick={handleQuickExport}
              disabled={!hasFiles}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="i-ph:download-simple" />
              Quick Export
            </button>
            <button
              onClick={handleOpenModal}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors border-t border-bolt-elements-borderColor"
            >
              <div className="i-ph:sliders" />
              Export with Options...
            </button>
          </div>
        </>
      )}
    </div>
  );
});

/**
 * Compact export button for tight spaces
 */
export const ExportButtonCompact = memo(({ className }: { className?: string }) => {
  const projectId = useStore(workbenchStore.projectId);
  const files = useStore(workbenchStore.files);
  const progress = useStore(exportProgress);

  const isExporting = progress.status !== 'idle' && progress.status !== 'complete' && progress.status !== 'error';
  const hasFiles = Object.keys(files).length > 0;

  const handleClick = useCallback(async () => {
    if (!hasFiles) {
      toast.error('No files to export');
      return;
    }

    try {
      if (projectId) {
        await quickExport(projectId);
      } else {
        await quickExportFromMemory(files as any);
      }
    } catch (error) {
      toast.error('Export failed');
    }
  }, [projectId, files, hasFiles]);

  return (
    <button
      onClick={handleClick}
      disabled={isExporting || !hasFiles}
      title="Export project"
      className={classNames(
        'p-2 rounded-md transition-colors',
        isExporting
          ? 'text-blue-500 cursor-wait'
          : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      <div
        className={classNames(
          'text-lg',
          isExporting ? 'i-ph:spinner animate-spin' : 'i-ph:export'
        )}
      />
    </button>
  );
});
