/**
 * MoveDialog Component
 * Modal dialog for moving files/folders to a new location
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { classNames } from '~/utils/classNames';
import type { FileMap } from '~/lib/stores/files';

interface MoveDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** The path of the file/folder being moved */
  sourcePath: string;
  /** All files in the project */
  files: FileMap;
  /** Root folder path */
  rootFolder?: string;
  /** Called when a destination is selected */
  onMove: (sourcePath: string, destinationFolder: string) => void;
  /** Called when the dialog is cancelled */
  onCancel: () => void;
}

export const MoveDialog = memo(function MoveDialog({
  isOpen,
  sourcePath,
  files,
  rootFolder = '/home/project',
  onMove,
  onCancel,
}: MoveDialogProps) {
  const [selectedFolder, setSelectedFolder] = useState<string>(rootFolder);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([rootFolder]));

  // Extract the name of the item being moved
  const itemName = useMemo(() => {
    return sourcePath.split('/').pop() || '';
  }, [sourcePath]);

  // Get the parent folder of the source item
  const sourceParentFolder = useMemo(() => {
    const parts = sourcePath.split('/');
    parts.pop();
    return parts.join('/') || rootFolder;
  }, [sourcePath, rootFolder]);

  // Build a list of all folders from the files map
  const folders = useMemo(() => {
    const folderSet = new Set<string>();
    folderSet.add(rootFolder);

    Object.entries(files).forEach(([path, dirent]) => {
      if (dirent?.type === 'folder') {
        // Don't include the source path if it's a folder (can't move into itself)
        if (!path.startsWith(sourcePath)) {
          folderSet.add(path);
        }
      } else if (dirent?.type === 'file') {
        // Extract folder paths from file paths
        const parts = path.split('/');
        parts.pop(); // Remove file name
        let currentPath = '';
        for (const part of parts) {
          if (part) {
            currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
            // Don't include paths that would result in moving into itself
            if (!currentPath.startsWith(sourcePath)) {
              folderSet.add(currentPath);
            }
          }
        }
      }
    });

    return Array.from(folderSet).sort();
  }, [files, sourcePath, rootFolder]);

  // Filter folders based on search query
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;
    const query = searchQuery.toLowerCase();
    return folders.filter(folder => folder.toLowerCase().includes(query));
  }, [folders, searchQuery]);

  // Build folder tree structure
  const folderTree = useMemo(() => {
    const tree: { path: string; name: string; depth: number; hasChildren: boolean }[] = [];
    const processedPaths = new Set<string>();

    filteredFolders.forEach(folderPath => {
      const parts = folderPath.split('/').filter(Boolean);
      const depth = parts.length - (rootFolder.split('/').filter(Boolean).length);

      if (!processedPaths.has(folderPath)) {
        processedPaths.add(folderPath);
        const name = parts[parts.length - 1] || '/';
        const hasChildren = filteredFolders.some(f => f.startsWith(folderPath + '/'));
        tree.push({ path: folderPath, name, depth: Math.max(0, depth), hasChildren });
      }
    });

    return tree;
  }, [filteredFolders, rootFolder]);

  // Toggle folder expansion
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Check if a folder should be visible (all parents expanded)
  const isFolderVisible = useCallback((path: string) => {
    const parts = path.split('/').filter(Boolean);
    let currentPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : `/${parts[i]}`;
      if (!expandedFolders.has(currentPath)) {
        return false;
      }
    }
    return true;
  }, [expandedFolders]);

  // Handle move confirmation
  const handleConfirm = useCallback(() => {
    if (selectedFolder && selectedFolder !== sourceParentFolder) {
      onMove(sourcePath, selectedFolder);
    }
  }, [selectedFolder, sourceParentFolder, sourcePath, onMove]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter' && selectedFolder !== sourceParentFolder) {
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, handleConfirm, selectedFolder, sourceParentFolder]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFolder(rootFolder);
      setSearchQuery('');
      // Expand the path to the current parent folder
      const parts = sourceParentFolder.split('/').filter(Boolean);
      const initialExpanded = new Set<string>([rootFolder]);
      let currentPath = '';
      parts.forEach(part => {
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
        initialExpanded.add(currentPath);
      });
      setExpandedFolders(initialExpanded);
    }
  }, [isOpen, rootFolder, sourceParentFolder]);

  if (!isOpen) return null;

  const canMove = selectedFolder !== sourceParentFolder;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md max-h-[70vh] flex flex-col bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor">
          <div className="flex items-center gap-2">
            <span className="i-ph:folder-open-duotone text-lg text-blue-400" />
            <h2 className="text-lg font-medium text-bolt-elements-textPrimary">
              Move "{itemName}"
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary"
          >
            <span className="i-ph:x text-lg" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-bolt-elements-borderColor">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 i-ph:magnifying-glass text-bolt-elements-textSecondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search folders..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded outline-none focus:border-blue-500 text-bolt-elements-textPrimary placeholder:text-bolt-elements-textSecondary"
              autoFocus
            />
          </div>
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {folderTree.map(({ path, name, depth, hasChildren }) => {
            if (!isFolderVisible(path)) return null;

            const isSelected = selectedFolder === path;
            const isCurrent = path === sourceParentFolder;
            const isExpanded = expandedFolders.has(path);

            return (
              <div
                key={path}
                className={classNames(
                  'flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors',
                  {
                    'bg-blue-500/20 text-blue-400': isSelected,
                    'hover:bg-bolt-elements-background-depth-2': !isSelected,
                    'text-bolt-elements-textPrimary': !isSelected && !isCurrent,
                    'text-bolt-elements-textSecondary italic': isCurrent,
                  }
                )}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
                onClick={() => setSelectedFolder(path)}
                onDoubleClick={() => hasChildren && toggleFolder(path)}
              >
                {/* Expand/Collapse Button */}
                {hasChildren ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFolder(path);
                    }}
                    className="p-0.5 hover:bg-bolt-elements-background-depth-3 rounded"
                  >
                    <span
                      className={classNames('text-sm transition-transform', {
                        'i-ph:caret-right': !isExpanded,
                        'i-ph:caret-down': isExpanded,
                      })}
                    />
                  </button>
                ) : (
                  <span className="w-5" />
                )}

                {/* Folder Icon */}
                <span
                  className={classNames('text-lg', {
                    'i-ph:folder-open-duotone text-blue-400': isExpanded,
                    'i-ph:folder-duotone text-yellow-400': !isExpanded,
                  })}
                />

                {/* Folder Name */}
                <span className="flex-1 truncate text-sm">
                  {path === rootFolder ? 'Project Root' : name}
                </span>

                {/* Current Location Indicator */}
                {isCurrent && (
                  <span className="text-xs text-bolt-elements-textTertiary">(current)</span>
                )}

                {/* Selected Indicator */}
                {isSelected && !isCurrent && (
                  <span className="i-ph:check text-blue-400" />
                )}
              </div>
            );
          })}

          {filteredFolders.length === 0 && (
            <div className="text-center py-8 text-bolt-elements-textSecondary text-sm">
              No folders found
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-bolt-elements-borderColor">
          <div className="text-xs text-bolt-elements-textSecondary truncate max-w-[60%]">
            {selectedFolder === sourceParentFolder ? (
              <span className="text-yellow-500">Select a different folder</span>
            ) : (
              <>
                Move to: <span className="text-bolt-elements-textPrimary">{selectedFolder}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canMove}
              className={classNames(
                'px-3 py-1.5 text-sm rounded transition-colors',
                {
                  'bg-blue-600 text-white hover:bg-blue-700': canMove,
                  'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary cursor-not-allowed': !canMove,
                }
              )}
            >
              Move
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default MoveDialog;
