import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import type { FileMap } from '~/lib/stores/files';
import { filesWithErrorsAtom, getFileErrorCount } from '~/lib/stores/errors';
import { classNames } from '~/utils/classNames';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { useContextPaths } from '~/lib/hooks/useContextPaths';
import { MoveDialog } from './MoveDialog';

const logger = createScopedLogger('FileTree');

const NODE_PADDING_LEFT = 8;
const DEFAULT_HIDDEN_FILES = [/\/node_modules\//, /\/\.next/, /\/\.astro/];

// File extension to icon class mapping using Phosphor icons
const FILE_ICON_MAP: Record<string, string> = {
  // TypeScript/JavaScript
  ts: 'i-ph:file-ts-duotone text-blue-400',
  tsx: 'i-ph:file-tsx-duotone text-blue-500',
  js: 'i-ph:file-js-duotone text-yellow-400',
  jsx: 'i-ph:file-jsx-duotone text-yellow-500',
  mjs: 'i-ph:file-js-duotone text-yellow-400',
  cjs: 'i-ph:file-js-duotone text-yellow-400',
  // Web
  html: 'i-ph:file-html-duotone text-orange-400',
  css: 'i-ph:file-css-duotone text-blue-300',
  scss: 'i-ph:file-css-duotone text-pink-400',
  sass: 'i-ph:file-css-duotone text-pink-400',
  less: 'i-ph:file-css-duotone text-indigo-400',
  // Data/Config
  json: 'i-ph:file-duotone text-yellow-300',
  yaml: 'i-ph:file-duotone text-red-400',
  yml: 'i-ph:file-duotone text-red-400',
  toml: 'i-ph:file-duotone text-recoder-elements-textSecondary',
  xml: 'i-ph:file-duotone text-orange-300',
  // Documentation
  md: 'i-ph:file-md-duotone text-recoder-elements-textSecondary',
  mdx: 'i-ph:file-md-duotone text-yellow-400',
  txt: 'i-ph:file-text-duotone text-recoder-elements-textSecondary',
  // Images
  png: 'i-ph:file-image-duotone text-purple-400',
  jpg: 'i-ph:file-image-duotone text-purple-400',
  jpeg: 'i-ph:file-image-duotone text-purple-400',
  gif: 'i-ph:file-image-duotone text-purple-400',
  svg: 'i-ph:file-svg-duotone text-orange-400',
  webp: 'i-ph:file-image-duotone text-purple-400',
  ico: 'i-ph:file-image-duotone text-purple-400',
  // Other languages
  py: 'i-ph:file-py-duotone text-yellow-400',
  rs: 'i-ph:file-rs-duotone text-orange-500',
  go: 'i-ph:file-duotone text-cyan-400',
  java: 'i-ph:file-duotone text-red-400',
  c: 'i-ph:file-c-duotone text-blue-400',
  cpp: 'i-ph:file-cpp-duotone text-blue-500',
  h: 'i-ph:file-c-duotone text-blue-300',
  hpp: 'i-ph:file-cpp-duotone text-blue-400',
  // Database
  sql: 'i-ph:file-sql-duotone text-blue-300',
  prisma: 'i-ph:database-duotone text-teal-400',
  // Config files
  env: 'i-ph:gear-duotone text-yellow-500',
  gitignore: 'i-ph:git-branch-duotone text-orange-400',
  dockerignore: 'i-ph:cube-duotone text-blue-400',
  eslintrc: 'i-ph:gear-duotone text-purple-400',
  prettierrc: 'i-ph:gear-duotone text-pink-400',
  // Lock files
  lock: 'i-ph:lock-duotone text-recoder-elements-textTertiary',
  // Shell
  sh: 'i-ph:terminal-duotone text-green-400',
  bash: 'i-ph:terminal-duotone text-green-400',
  zsh: 'i-ph:terminal-duotone text-green-400',
  // Vue
  vue: 'i-ph:file-vue-duotone text-green-500',
};

// Special file name mappings (exact match)
const SPECIAL_FILE_ICONS: Record<string, string> = {
  'package.json': 'i-ph:package-duotone text-green-400',
  'package-lock.json': 'i-ph:lock-duotone text-recoder-elements-textTertiary',
  'yarn.lock': 'i-ph:lock-duotone text-blue-400',
  'pnpm-lock.yaml': 'i-ph:lock-duotone text-orange-400',
  'tsconfig.json': 'i-ph:gear-duotone text-blue-400',
  'tailwind.config.js': 'i-ph:gear-duotone text-cyan-400',
  'tailwind.config.ts': 'i-ph:gear-duotone text-cyan-400',
  'vite.config.js': 'i-ph:lightning-duotone text-purple-400',
  'vite.config.ts': 'i-ph:lightning-duotone text-purple-400',
  'next.config.js': 'i-ph:gear-duotone text-recoder-elements-textSecondary',
  'next.config.mjs': 'i-ph:gear-duotone text-recoder-elements-textSecondary',
  '.gitignore': 'i-ph:git-branch-duotone text-orange-400',
  '.env': 'i-ph:gear-duotone text-yellow-500',
  '.env.local': 'i-ph:gear-duotone text-yellow-500',
  '.env.development': 'i-ph:gear-duotone text-yellow-500',
  '.env.production': 'i-ph:gear-duotone text-yellow-500',
  'Dockerfile': 'i-ph:cube-duotone text-blue-400',
  'docker-compose.yml': 'i-ph:cube-duotone text-blue-400',
  'docker-compose.yaml': 'i-ph:cube-duotone text-blue-400',
  'README.md': 'i-ph:book-open-duotone text-blue-300',
  'LICENSE': 'i-ph:certificate-duotone text-yellow-400',
};

function getFileIcon(fileName: string): string {
  // Check special file names first
  if (SPECIAL_FILE_ICONS[fileName]) {
    return SPECIAL_FILE_ICONS[fileName];
  }

  // Check for dotfiles without extension
  if (fileName.startsWith('.')) {
    const dotfileName = fileName.slice(1);
    if (FILE_ICON_MAP[dotfileName]) {
      return FILE_ICON_MAP[dotfileName];
    }
  }

  // Get extension
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && FILE_ICON_MAP[ext]) {
    return FILE_ICON_MAP[ext];
  }

  // Default file icon
  return 'i-ph:file-duotone';
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  type: 'file' | 'folder';
}

interface Props {
  files?: FileMap;
  selectedFile?: string;
  onFileSelect?: (filePath: string) => void;
  onFileCreate?: (folderPath: string, fileName: string) => void;
  onFolderCreate?: (folderPath: string, folderName: string) => void;
  onFileDelete?: (filePath: string) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  onFileMove?: (sourcePath: string, destinationFolder: string) => void;
  onFileCopy?: (filePath: string) => void;
  rootFolder?: string;
  hideRoot?: boolean;
  collapsed?: boolean;
  allowFolderSelection?: boolean;
  hiddenFiles?: Array<string | RegExp>;
  unsavedFiles?: Set<string>;
  className?: string;
  searchQuery?: string;
}

// Drag state for drag-and-drop functionality
interface DragState {
  isDragging: boolean;
  draggedPath: string | null;
  draggedType: 'file' | 'folder' | null;
  dropTargetPath: string | null;
}

// Highlight matching text in search results
const highlightMatch = (text: string, query: string): React.ReactNode => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text;
  }

  const end = index + trimmedQuery.length;

  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-recoder-elements-item-backgroundAccent/30 px-0.5 text-recoder-elements-textPrimary">
        {text.slice(index, end)}
      </mark>
      {text.slice(end)}
    </>
  );
};

export const FileTree = memo(
  ({
    files = {},
    onFileSelect,
    onFileCreate,
    onFolderCreate,
    onFileDelete,
    onFileRename,
    onFileMove,
    onFileCopy,
    selectedFile,
    rootFolder,
    hideRoot = false,
    collapsed = false,
    allowFolderSelection = false,
    hiddenFiles,
    className,
    unsavedFiles,
    searchQuery = '',
  }: Props) => {
    renderLogger.trace('FileTree');

    const filesWithErrors = useStore(filesWithErrorsAtom);
    const { addContextPath, removeContextPath, isInContext } = useContextPaths();

    // Drag-and-drop state
    const [dragState, setDragState] = useState<DragState>({
      isDragging: false,
      draggedPath: null,
      draggedType: null,
      dropTargetPath: null,
    });
    const computedHiddenFiles = useMemo(() => [...DEFAULT_HIDDEN_FILES, ...(hiddenFiles ?? [])], [hiddenFiles]);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [newItemName, setNewItemName] = useState('');
    const [creatingIn, setCreatingIn] = useState<{ path: string; type: 'file' | 'folder' } | null>(null);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const containerRef = useRef<HTMLDivElement>(null);

    const fileList = useMemo(() => {
      return buildFileList(files, rootFolder, hideRoot, computedHiddenFiles);
    }, [files, rootFolder, hideRoot, computedHiddenFiles]);

    const [collapsedFolders, setCollapsedFolders] = useState(() => {
      return collapsed
        ? new Set(fileList.filter((item) => item.kind === 'folder').map((item) => item.fullPath))
        : new Set<string>();
    });

    useEffect(() => {
      if (collapsed) {
        setCollapsedFolders(new Set(fileList.filter((item) => item.kind === 'folder').map((item) => item.fullPath)));
        return;
      }

      setCollapsedFolders((prevCollapsed) => {
        const newCollapsed = new Set<string>();

        for (const folder of fileList) {
          if (folder.kind === 'folder' && prevCollapsed.has(folder.fullPath)) {
            newCollapsed.add(folder.fullPath);
          }
        }

        return newCollapsed;
      });
    }, [fileList, collapsed]);

    const filteredFileList = useMemo(() => {
      const list = [];

      let lastDepth = Number.MAX_SAFE_INTEGER;

      for (const fileOrFolder of fileList) {
        const depth = fileOrFolder.depth;

        // if the depth is equal we reached the end of the collaped group
        if (lastDepth === depth) {
          lastDepth = Number.MAX_SAFE_INTEGER;
        }

        // ignore collapsed folders
        if (collapsedFolders.has(fileOrFolder.fullPath)) {
          lastDepth = Math.min(lastDepth, depth);
        }

        // ignore files and folders below the last collapsed folder
        if (lastDepth < depth) {
          continue;
        }

        list.push(fileOrFolder);
      }

      return list;
    }, [fileList, collapsedFolders]);

    const toggleCollapseState = (fullPath: string) => {
      setCollapsedFolders((prevSet) => {
        const newSet = new Set(prevSet);

        if (newSet.has(fullPath)) {
          newSet.delete(fullPath);
        } else {
          newSet.add(fullPath);
        }

        return newSet;
      });
    };

    // Context menu handlers
    const handleContextMenu = useCallback((e: React.MouseEvent, path: string, type: 'file' | 'folder') => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, path, type });
    }, []);

    const closeContextMenu = useCallback(() => {
      setContextMenu(null);
    }, []);

    const handleNewFile = useCallback(() => {
      if (contextMenu) {
        const folderPath = contextMenu.type === 'folder' ? contextMenu.path : contextMenu.path.substring(0, contextMenu.path.lastIndexOf('/'));
        setCreatingIn({ path: folderPath, type: 'file' });
        setNewItemName('');
      }
      closeContextMenu();
    }, [contextMenu, closeContextMenu]);

    const handleNewFolder = useCallback(() => {
      if (contextMenu) {
        const folderPath = contextMenu.type === 'folder' ? contextMenu.path : contextMenu.path.substring(0, contextMenu.path.lastIndexOf('/'));
        setCreatingIn({ path: folderPath, type: 'folder' });
        setNewItemName('');
      }
      closeContextMenu();
    }, [contextMenu, closeContextMenu]);

    const handleRename = useCallback(() => {
      if (contextMenu) {
        setRenaming(contextMenu.path);
        const name = contextMenu.path.split('/').pop() || '';
        setNewItemName(name);
      }
      closeContextMenu();
    }, [contextMenu, closeContextMenu]);

    const handleDelete = useCallback(() => {
      if (contextMenu && onFileDelete) {
        onFileDelete(contextMenu.path);
      }
      closeContextMenu();
    }, [contextMenu, onFileDelete, closeContextMenu]);

    const handleCopy = useCallback(() => {
      if (contextMenu && onFileCopy) {
        onFileCopy(contextMenu.path);
      }
      closeContextMenu();
    }, [contextMenu, onFileCopy, closeContextMenu]);

    const handleToggleContext = useCallback(() => {
      if (contextMenu && contextMenu.type === 'file') {
        if (isInContext(contextMenu.path)) {
          removeContextPath(contextMenu.path);
        } else {
          addContextPath(contextMenu.path);
        }
      }
      closeContextMenu();
    }, [contextMenu, isInContext, addContextPath, removeContextPath, closeContextMenu]);

    // Handle move from context menu - opens move dialog
    const [moveDialogPath, setMoveDialogPath] = useState<string | null>(null);

    const handleMove = useCallback(() => {
      if (contextMenu) {
        setMoveDialogPath(contextMenu.path);
      }
      closeContextMenu();
    }, [contextMenu, closeContextMenu]);

    const handleMoveConfirm = useCallback((sourcePath: string, destinationFolder: string) => {
      if (onFileMove) {
        onFileMove(sourcePath, destinationFolder);
      }
      setMoveDialogPath(null);
    }, [onFileMove]);

    const handleMoveCancel = useCallback(() => {
      setMoveDialogPath(null);
    }, []);

    // Start rename for the currently focused/selected item (for F2 shortcut)
    const startRenameForFocused = useCallback(() => {
      const focusedItem = filteredFileList[focusedIndex];
      if (focusedItem) {
        setRenaming(focusedItem.fullPath);
        setNewItemName(focusedItem.name);
      }
    }, [filteredFileList, focusedIndex]);

    // Drag and drop handlers
    const handleDragStart = useCallback((e: React.DragEvent, path: string, type: 'file' | 'folder') => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', path);
      e.dataTransfer.setData('application/x-filetree-item', JSON.stringify({ path, type }));
      setDragState({
        isDragging: true,
        draggedPath: path,
        draggedType: type,
        dropTargetPath: null,
      });
    }, []);

    const handleDragEnd = useCallback(() => {
      setDragState({
        isDragging: false,
        draggedPath: null,
        draggedType: null,
        dropTargetPath: null,
      });
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, folderPath: string) => {
      e.preventDefault();
      e.stopPropagation();

      // Don't allow dropping on itself or inside itself
      if (dragState.draggedPath === folderPath) return;
      if (dragState.draggedPath && folderPath.startsWith(dragState.draggedPath + '/')) return;

      e.dataTransfer.dropEffect = 'move';
      setDragState(prev => ({
        ...prev,
        dropTargetPath: folderPath,
      }));
    }, [dragState.draggedPath]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      // Only clear if leaving the actual element (not entering a child)
      const relatedTarget = e.relatedTarget as unknown as HTMLElement;
      const currentTarget = e.currentTarget as unknown as HTMLElement;
      if (!currentTarget.contains(relatedTarget)) {
        setDragState(prev => ({
          ...prev,
          dropTargetPath: null,
        }));
      }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetFolderPath: string) => {
      e.preventDefault();
      e.stopPropagation();

      const itemData = e.dataTransfer.getData('application/x-filetree-item');
      if (itemData && onFileMove) {
        const { path } = JSON.parse(itemData);
        // Don't move to same location
        const currentParent = path.substring(0, path.lastIndexOf('/'));
        if (currentParent !== targetFolderPath && path !== targetFolderPath && !targetFolderPath.startsWith(path + '/')) {
          onFileMove(path, targetFolderPath);
        }
      }

      setDragState({
        isDragging: false,
        draggedPath: null,
        draggedType: null,
        dropTargetPath: null,
      });
    }, [onFileMove]);

    const submitNewItem = useCallback(() => {
      if (creatingIn && newItemName.trim()) {
        if (creatingIn.type === 'file' && onFileCreate) {
          onFileCreate(creatingIn.path, newItemName.trim());
        } else if (creatingIn.type === 'folder' && onFolderCreate) {
          onFolderCreate(creatingIn.path, newItemName.trim());
        }
      }
      setCreatingIn(null);
      setNewItemName('');
    }, [creatingIn, newItemName, onFileCreate, onFolderCreate]);

    const submitRename = useCallback(() => {
      if (renaming && newItemName.trim() && onFileRename) {
        const dir = renaming.substring(0, renaming.lastIndexOf('/'));
        const newPath = `${dir}/${newItemName.trim()}`;
        onFileRename(renaming, newPath);
      }
      setRenaming(null);
      setNewItemName('');
    }, [renaming, newItemName, onFileRename]);

    // Close context menu on click outside
    useEffect(() => {
      const handleClick = () => closeContextMenu();
      if (contextMenu) {
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
      }
    }, [contextMenu, closeContextMenu]);

    // Keyboard navigation handler
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      // Skip if currently renaming or creating
      if (renaming || creatingIn) return;

      const totalItems = filteredFileList.length;
      if (totalItems === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev < totalItems - 1 ? prev + 1 : 0;
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : totalItems - 1;
            return next;
          });
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            const item = filteredFileList[focusedIndex];
            if (item.kind === 'folder' && collapsedFolders.has(item.fullPath)) {
              toggleCollapseState(item.fullPath);
            }
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            const item = filteredFileList[focusedIndex];
            if (item.kind === 'folder' && !collapsedFolders.has(item.fullPath)) {
              toggleCollapseState(item.fullPath);
            }
          }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            const item = filteredFileList[focusedIndex];
            if (item.kind === 'file') {
              onFileSelect?.(item.fullPath);
            } else {
              toggleCollapseState(item.fullPath);
            }
          }
          break;
        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedIndex(totalItems - 1);
          break;
        case 'F2':
          // F2 to rename focused item
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            startRenameForFocused();
          }
          break;
        case 'Delete':
        case 'Backspace':
          // Delete key to delete focused item (with confirmation)
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (focusedIndex >= 0 && focusedIndex < totalItems && onFileDelete) {
              const item = filteredFileList[focusedIndex];
              onFileDelete(item.fullPath);
            }
          }
          break;
      }
    }, [filteredFileList, focusedIndex, collapsedFolders, renaming, creatingIn, onFileSelect, onFileDelete, toggleCollapseState, startRenameForFocused]);

    // Update focused index when selected file changes externally
    useEffect(() => {
      if (selectedFile) {
        const index = filteredFileList.findIndex((item) => item.fullPath === selectedFile);
        if (index >= 0) {
          setFocusedIndex(index);
        }
      }
    }, [selectedFile, filteredFileList]);

    return (
      <div
        ref={containerRef}
        className={classNames('text-sm relative outline-none', className)}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="tree"
        aria-label="File tree"
      >
        {filteredFileList.map((fileOrFolder, index) => {
          switch (fileOrFolder.kind) {
            case 'file': {
              // Check if file has errors (try with and without /workspace prefix)
              const hasErrors = filesWithErrors.has(fileOrFolder.fullPath) ||
                filesWithErrors.has(`/workspace${fileOrFolder.fullPath}`) ||
                filesWithErrors.has(fileOrFolder.fullPath.replace('/workspace', ''));
              const errorCount = hasErrors ? getFileErrorCount(fileOrFolder.fullPath) : 0;

              // Check if renaming this file
              if (renaming === fileOrFolder.fullPath) {
                return (
                  <div key={fileOrFolder.id} style={{ paddingLeft: `${6 + fileOrFolder.depth * NODE_PADDING_LEFT}px` }} className="py-0.5">
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename();
                        if (e.key === 'Escape') { setRenaming(null); setNewItemName(''); }
                      }}
                      onBlur={submitRename}
                      autoFocus
                      className="w-full px-1 py-0.5 text-sm text-recoder-elements-textPrimary bg-recoder-elements-background-depth-3 border border-blue-500 rounded outline-none"
                    />
                  </div>
                );
              }

              return (
                <File
                  key={fileOrFolder.id}
                  selected={selectedFile === fileOrFolder.fullPath}
                  focused={focusedIndex === index}
                  file={fileOrFolder}
                  unsavedChanges={unsavedFiles?.has(fileOrFolder.fullPath)}
                  errorCount={errorCount}
                  searchQuery={searchQuery}
                  onClick={() => {
                    setFocusedIndex(index);
                    onFileSelect?.(fileOrFolder.fullPath);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, fileOrFolder.fullPath, 'file')}
                  draggable={!!onFileMove}
                  onDragStart={(e) => handleDragStart(e, fileOrFolder.fullPath, 'file')}
                  onDragEnd={handleDragEnd}
                  isDragging={dragState.draggedPath === fileOrFolder.fullPath}
                />
              );
            }
            case 'folder': {
              // Check if renaming this folder
              if (renaming === fileOrFolder.fullPath) {
                return (
                  <div key={fileOrFolder.id} style={{ paddingLeft: `${6 + fileOrFolder.depth * NODE_PADDING_LEFT}px` }} className="py-0.5">
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename();
                        if (e.key === 'Escape') { setRenaming(null); setNewItemName(''); }
                      }}
                      onBlur={submitRename}
                      autoFocus
                      className="w-full px-1 py-0.5 text-sm text-recoder-elements-textPrimary bg-recoder-elements-background-depth-3 border border-blue-500 rounded outline-none"
                    />
                  </div>
                );
              }

              return (
                <Folder
                  key={fileOrFolder.id}
                  folder={fileOrFolder}
                  selected={allowFolderSelection && selectedFile === fileOrFolder.fullPath}
                  focused={focusedIndex === index}
                  collapsed={collapsedFolders.has(fileOrFolder.fullPath)}
                  searchQuery={searchQuery}
                  onClick={() => {
                    setFocusedIndex(index);
                    toggleCollapseState(fileOrFolder.fullPath);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, fileOrFolder.fullPath, 'folder')}
                  draggable={!!onFileMove}
                  onDragStart={(e) => handleDragStart(e, fileOrFolder.fullPath, 'folder')}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, fileOrFolder.fullPath)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, fileOrFolder.fullPath)}
                  isDragging={dragState.draggedPath === fileOrFolder.fullPath}
                  isDropTarget={dragState.dropTargetPath === fileOrFolder.fullPath}
                />
              );
            }
            default: {
              return undefined;
            }
          }
        })}

        {/* New file/folder input */}
        {creatingIn && (
          <div style={{ paddingLeft: `${6 + 2 * NODE_PADDING_LEFT}px` }} className="py-0.5">
            <div className="flex items-center gap-1">
              <span className={creatingIn.type === 'file' ? 'i-ph:file-duotone' : 'i-ph:folder-duotone'} />
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNewItem();
                  if (e.key === 'Escape') { setCreatingIn(null); setNewItemName(''); }
                }}
                onBlur={submitNewItem}
                autoFocus
                placeholder={creatingIn.type === 'file' ? 'filename.ts' : 'folder-name'}
                className="flex-1 px-1 py-0.5 text-sm text-recoder-elements-textPrimary bg-recoder-elements-background-depth-3 border border-blue-500 rounded outline-none placeholder:text-recoder-elements-textSecondary"
              />
            </div>
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleNewFile}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-recoder-elements-background-depth-3 flex items-center gap-2"
            >
              <span className="i-ph:file-plus" /> New File
            </button>
            <button
              onClick={handleNewFolder}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-recoder-elements-background-depth-3 flex items-center gap-2"
            >
              <span className="i-ph:folder-plus" /> New Folder
            </button>
            <div className="border-t border-recoder-elements-borderColor my-1" />
            <button
              onClick={handleRename}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-recoder-elements-background-depth-3 flex items-center gap-2"
            >
              <span className="i-ph:pencil" /> Rename
              <span className="ml-auto text-xs text-recoder-elements-textTertiary">F2</span>
            </button>
            {onFileMove && (
              <button
                onClick={handleMove}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-recoder-elements-background-depth-3 flex items-center gap-2"
              >
                <span className="i-ph:arrows-out-cardinal" /> Move to...
              </button>
            )}
            <button
              onClick={handleCopy}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-recoder-elements-background-depth-3 flex items-center gap-2"
            >
              <span className="i-ph:copy" /> Copy Path
            </button>
            {contextMenu.type === 'file' && (
              <button
                onClick={handleToggleContext}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-recoder-elements-background-depth-3 flex items-center gap-2 ${
                  isInContext(contextMenu.path) ? 'text-blue-400' : ''
                }`}
              >
                <span className={isInContext(contextMenu.path) ? 'i-ph:minus-circle' : 'i-ph:plus-circle'} />
                {isInContext(contextMenu.path) ? 'Remove from Context' : 'Add to Context'}
              </button>
            )}
            <div className="border-t border-recoder-elements-borderColor my-1" />
            <button
              onClick={handleDelete}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-recoder-elements-background-depth-3 text-red-400 flex items-center gap-2"
            >
              <span className="i-ph:trash" /> Delete
            </button>
          </div>
        )}

        {/* Move Dialog */}
        {moveDialogPath && (
          <MoveDialog
            isOpen={!!moveDialogPath}
            sourcePath={moveDialogPath}
            files={files}
            rootFolder={rootFolder}
            onMove={handleMoveConfirm}
            onCancel={handleMoveCancel}
          />
        )}
      </div>
    );
  },
);

export default FileTree;

interface FolderProps {
  folder: FolderNode;
  collapsed: boolean;
  selected?: boolean;
  focused?: boolean;
  searchQuery?: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  // Drag-and-drop props
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
}

// Folder name to icon/color mapping for special folders
const FOLDER_ICONS: Record<string, string> = {
  'src': 'text-blue-400',
  'app': 'text-blue-400',
  'pages': 'text-blue-400',
  'components': 'text-green-400',
  'hooks': 'text-purple-400',
  'lib': 'text-yellow-400',
  'utils': 'text-yellow-400',
  'helpers': 'text-yellow-400',
  'services': 'text-orange-400',
  'api': 'text-red-400',
  'routes': 'text-red-400',
  'styles': 'text-pink-400',
  'assets': 'text-purple-400',
  'images': 'text-purple-400',
  'public': 'text-green-400',
  'tests': 'text-green-400',
  '__tests__': 'text-green-400',
  'test': 'text-green-400',
  'spec': 'text-green-400',
  'config': 'text-recoder-elements-textSecondary',
  'types': 'text-blue-300',
  'interfaces': 'text-blue-300',
  'models': 'text-orange-400',
  'store': 'text-purple-400',
  'stores': 'text-purple-400',
  'context': 'text-purple-400',
  'providers': 'text-purple-400',
  'middleware': 'text-yellow-400',
  'server': 'text-red-400',
  '.server': 'text-red-400',
  'client': 'text-blue-400',
  '.client': 'text-blue-400',
  'layouts': 'text-cyan-400',
};

function getFolderColor(folderName: string): string {
  return FOLDER_ICONS[folderName] || '';
}

function Folder({
  folder: { depth, name, fullPath },
  collapsed,
  selected = false,
  focused = false,
  searchQuery = '',
  onClick,
  onContextMenu,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragging = false,
  isDropTarget = false,
}: FolderProps) {
  const folderColor = getFolderColor(name);

  return (
    <NodeButton
      className={classNames('group transition-all duration-150', {
        'bg-transparent text-recoder-elements-item-contentDefault hover:text-recoder-elements-item-contentActive hover:bg-recoder-elements-item-backgroundActive':
          !selected && !focused && !isDropTarget,
        'bg-recoder-elements-item-backgroundAccent text-recoder-elements-item-contentAccent': selected,
        'bg-recoder-elements-item-backgroundActive/50 ring-1 ring-recoder-elements-borderColor ring-inset': focused && !selected && !isDropTarget,
        'opacity-50': isDragging,
        'bg-blue-500/20 ring-2 ring-blue-500 ring-inset': isDropTarget,
      })}
      depth={depth}
      iconClasses={classNames('scale-98', {
        'i-ph:caret-right': collapsed,
        'i-ph:caret-down': !collapsed,
      })}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-1">
        <span className={classNames('shrink-0', folderColor, {
          'i-ph:folder-duotone': collapsed && !isDropTarget,
          'i-ph:folder-open-duotone': !collapsed || isDropTarget,
          'text-blue-400': isDropTarget,
        })} />
        {searchQuery ? highlightMatch(name, searchQuery) : name}
        {isDropTarget && (
          <span className="ml-auto text-xs text-blue-400">Drop here</span>
        )}
      </div>
    </NodeButton>
  );
}

interface FileProps {
  file: FileNode;
  selected: boolean;
  focused?: boolean;
  unsavedChanges?: boolean;
  errorCount?: number;
  searchQuery?: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  // Drag-and-drop props
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}

function File({
  file: { depth, name },
  onClick,
  selected,
  focused = false,
  unsavedChanges = false,
  errorCount = 0,
  searchQuery = '',
  onContextMenu,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false,
}: FileProps) {
  const fileIconClass = getFileIcon(name);

  return (
    <NodeButton
      className={classNames('group transition-opacity duration-150', {
        'bg-transparent hover:bg-recoder-elements-item-backgroundActive text-recoder-elements-item-contentDefault': !selected && !focused,
        'bg-recoder-elements-item-backgroundAccent text-recoder-elements-item-contentAccent': selected,
        'bg-recoder-elements-item-backgroundActive/50 ring-1 ring-recoder-elements-borderColor ring-inset': focused && !selected,
        'opacity-50': isDragging,
      })}
      depth={depth}
      iconClasses={classNames(fileIconClass, 'scale-98', {
        'group-hover:text-recoder-elements-item-contentActive': !selected && !fileIconClass.includes('text-'),
        'text-red-500': errorCount > 0,
      })}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div
        className={classNames('flex items-center', {
          'group-hover:text-recoder-elements-item-contentActive': !selected,
        })}
      >
        <div className={classNames('flex-1 truncate pr-2', { 'text-red-400': errorCount > 0 })}>
          {searchQuery ? highlightMatch(name, searchQuery) : name}
        </div>
        {errorCount > 0 && (
          <span className="i-ph:x-circle-fill scale-75 shrink-0 text-red-500 mr-1" title={`${errorCount} error${errorCount > 1 ? 's' : ''}`} />
        )}
        {unsavedChanges && <span className="i-ph:circle-fill scale-68 shrink-0 text-orange-500" />}
      </div>
    </NodeButton>
  );
}

interface ButtonProps {
  depth: number;
  iconClasses: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  // Drag-and-drop props
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

function NodeButton({
  depth,
  iconClasses,
  onClick,
  onContextMenu,
  className,
  children,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ButtonProps) {
  return (
    <button
      className={classNames(
        'flex items-center gap-1.5 w-full pr-2 border-2 border-transparent text-faded py-0.5',
        className,
      )}
      style={{ paddingLeft: `${6 + depth * NODE_PADDING_LEFT}px` }}
      onClick={() => onClick?.()}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className={classNames('scale-120 shrink-0', iconClasses)}></div>
      <div className="truncate w-full text-left">{children}</div>
    </button>
  );
}

type Node = FileNode | FolderNode;

interface BaseNode {
  id: number;
  depth: number;
  name: string;
  fullPath: string;
}

interface FileNode extends BaseNode {
  kind: 'file';
}

interface FolderNode extends BaseNode {
  kind: 'folder';
}

function buildFileList(
  files: FileMap,
  rootFolder = '/',
  hideRoot: boolean,
  hiddenFiles: Array<string | RegExp>,
): Node[] {
  const folderPaths = new Set<string>();
  const fileList: Node[] = [];

  let defaultDepth = 0;

  if (rootFolder === '/' && !hideRoot) {
    defaultDepth = 1;
    fileList.push({ kind: 'folder', name: '/', depth: 0, id: 0, fullPath: '/' });
  }

  for (const [filePath, dirent] of Object.entries(files)) {
    const segments = filePath.split('/').filter((segment) => segment);
    const fileName = segments.at(-1);

    if (!fileName || isHiddenFile(filePath, fileName, hiddenFiles)) {
      continue;
    }

    let currentPath = '';

    let i = 0;
    let depth = 0;

    while (i < segments.length) {
      const name = segments[i];
      const fullPath = (currentPath += `/${name}`);

      if (!fullPath.startsWith(rootFolder) || (hideRoot && fullPath === rootFolder)) {
        i++;
        continue;
      }

      if (i === segments.length - 1 && dirent?.type === 'file') {
        fileList.push({
          kind: 'file',
          id: fileList.length,
          name,
          fullPath,
          depth: depth + defaultDepth,
        });
      } else if (!folderPaths.has(fullPath)) {
        folderPaths.add(fullPath);

        fileList.push({
          kind: 'folder',
          id: fileList.length,
          name,
          fullPath,
          depth: depth + defaultDepth,
        });
      }

      i++;
      depth++;
    }
  }

  return sortFileList(rootFolder, fileList, hideRoot);
}

function isHiddenFile(filePath: string, fileName: string, hiddenFiles: Array<string | RegExp>) {
  return hiddenFiles.some((pathOrRegex) => {
    if (typeof pathOrRegex === 'string') {
      return fileName === pathOrRegex;
    }

    return pathOrRegex.test(filePath);
  });
}

/**
 * Sorts the given list of nodes into a tree structure (still a flat list).
 *
 * This function organizes the nodes into a hierarchical structure based on their paths,
 * with folders appearing before files and all items sorted alphabetically within their level.
 *
 * @note This function mutates the given `nodeList` array for performance reasons.
 *
 * @param rootFolder - The path of the root folder to start the sorting from.
 * @param nodeList - The list of nodes to be sorted.
 *
 * @returns A new array of nodes sorted in depth-first order.
 */
function sortFileList(rootFolder: string, nodeList: Node[], hideRoot: boolean): Node[] {
  logger.trace('sortFileList');

  const nodeMap = new Map<string, Node>();
  const childrenMap = new Map<string, Node[]>();

  // pre-sort nodes by name and type
  nodeList.sort((a, b) => compareNodes(a, b));

  for (const node of nodeList) {
    nodeMap.set(node.fullPath, node);

    const parentPath = node.fullPath.slice(0, node.fullPath.lastIndexOf('/'));

    if (parentPath !== rootFolder.slice(0, rootFolder.lastIndexOf('/'))) {
      if (!childrenMap.has(parentPath)) {
        childrenMap.set(parentPath, []);
      }

      childrenMap.get(parentPath)?.push(node);
    }
  }

  const sortedList: Node[] = [];

  const depthFirstTraversal = (path: string): void => {
    const node = nodeMap.get(path);

    if (node) {
      sortedList.push(node);
    }

    const children = childrenMap.get(path);

    if (children) {
      for (const child of children) {
        if (child.kind === 'folder') {
          depthFirstTraversal(child.fullPath);
        } else {
          sortedList.push(child);
        }
      }
    }
  };

  if (hideRoot) {
    // if root is hidden, start traversal from its immediate children
    const rootChildren = childrenMap.get(rootFolder) || [];

    for (const child of rootChildren) {
      depthFirstTraversal(child.fullPath);
    }
  } else {
    depthFirstTraversal(rootFolder);
  }

  return sortedList;
}

function compareNodes(a: Node, b: Node): number {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1;
  }

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}
