import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('EditorTabs');

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
  toml: 'i-ph:file-duotone text-bolt-elements-textSecondary',
  xml: 'i-ph:file-duotone text-orange-300',
  // Documentation
  md: 'i-ph:file-md-duotone text-bolt-elements-textSecondary',
  mdx: 'i-ph:file-md-duotone text-yellow-400',
  txt: 'i-ph:file-text-duotone text-bolt-elements-textSecondary',
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
  lock: 'i-ph:lock-duotone text-bolt-elements-textTertiary',
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
  'package-lock.json': 'i-ph:lock-duotone text-bolt-elements-textTertiary',
  'yarn.lock': 'i-ph:lock-duotone text-blue-400',
  'pnpm-lock.yaml': 'i-ph:lock-duotone text-orange-400',
  'tsconfig.json': 'i-ph:gear-duotone text-blue-400',
  'tailwind.config.js': 'i-ph:gear-duotone text-cyan-400',
  'tailwind.config.ts': 'i-ph:gear-duotone text-cyan-400',
  'vite.config.js': 'i-ph:lightning-duotone text-purple-400',
  'vite.config.ts': 'i-ph:lightning-duotone text-purple-400',
  'next.config.js': 'i-ph:gear-duotone text-bolt-elements-textSecondary',
  'next.config.mjs': 'i-ph:gear-duotone text-bolt-elements-textSecondary',
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

interface EditorTabsProps {
  unsavedFiles?: Set<string>;
  onRevealInTree?: (filePath: string) => void;
  onOpenNewFile?: () => void;
}

interface TabContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  filePath: string;
}

export const EditorTabs = memo(({ unsavedFiles, onRevealInTree, onOpenNewFile }: EditorTabsProps) => {
  const openTabs = useStore(workbenchStore.openTabs);
  const pinnedTabs = useStore(workbenchStore.pinnedTabs);
  const selectedFile = useStore(workbenchStore.selectedFile);

  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    filePath: '',
  });

  // Check scroll state
  const updateScrollState = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 1
    );
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState, openTabs]);

  // Scroll handlers
  const scrollLeft = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: -150, behavior: 'smooth' });
  }, []);

  const scrollRight = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: 150, behavior: 'smooth' });
  }, []);

  // Tab click handlers
  const handleTabClick = useCallback((filePath: string) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const handleTabClose = useCallback((e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    workbenchStore.closeTab(filePath);
  }, []);

  const handleMiddleClick = useCallback((e: React.MouseEvent, filePath: string) => {
    if (e.button === 1) {
      e.preventDefault();
      workbenchStore.closeTab(filePath);
    }
  }, []);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      filePath,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    if (contextMenu.isOpen) {
      const handleClickOutside = () => closeContextMenu();
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.isOpen, closeContextMenu]);

  // Context menu actions
  const handleClose = useCallback(() => {
    workbenchStore.closeTab(contextMenu.filePath);
    closeContextMenu();
  }, [contextMenu.filePath, closeContextMenu]);

  const handleCloseOthers = useCallback(() => {
    workbenchStore.closeOtherTabs(contextMenu.filePath);
    closeContextMenu();
  }, [contextMenu.filePath, closeContextMenu]);

  const handleCloseAll = useCallback(() => {
    workbenchStore.closeAllTabs();
    closeContextMenu();
  }, [closeContextMenu]);

  const handleCloseToRight = useCallback(() => {
    workbenchStore.closeTabsToRight(contextMenu.filePath);
    closeContextMenu();
  }, [contextMenu.filePath, closeContextMenu]);

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(contextMenu.filePath);
    } catch (err) {
      logger.error('Failed to copy path:', err);
    }
    closeContextMenu();
  }, [contextMenu.filePath, closeContextMenu]);

  const handleRevealInTree = useCallback(() => {
    onRevealInTree?.(contextMenu.filePath);
    closeContextMenu();
  }, [contextMenu.filePath, onRevealInTree, closeContextMenu]);

  const handleTogglePin = useCallback(() => {
    workbenchStore.togglePinTab(contextMenu.filePath);
    closeContextMenu();
  }, [contextMenu.filePath, closeContextMenu]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      workbenchStore.reorderTabs(fromIndex, toIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  // Double-click empty area to open new file
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    // Only trigger if clicking on the empty area (the container itself)
    if (e.target === tabsContainerRef.current || (e.target as HTMLElement).classList.contains('tabs-empty-area')) {
      onOpenNewFile?.();
    }
  }, [onOpenNewFile]);

  if (openTabs.length === 0) {
    return (
      <div
        className="flex items-center bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor h-9 px-2"
        onDoubleClick={onOpenNewFile}
      >
        <span className="text-bolt-elements-textTertiary text-xs italic">
          No open files - double-click to open
        </span>
      </div>
    );
  }

  // Sort tabs: pinned first, then unpinned in their order
  const sortedTabs = [...openTabs].sort((a, b) => {
    const aPinned = pinnedTabs.has(a);
    const bPinned = pinnedTabs.has(b);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  // Find the index in openTabs for drag/drop
  const getTabIndex = (filePath: string) => openTabs.indexOf(filePath);
  const isPinnedTab = (filePath: string) => pinnedTabs.has(filePath);

  return (
    <div className="relative flex items-center bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
      {/* Scroll left button */}
      {canScrollLeft && (
        <button
          onClick={scrollLeft}
          className="flex-shrink-0 flex items-center justify-center w-6 h-full hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors z-10 border-r border-bolt-elements-borderColor"
          title="Scroll tabs left"
        >
          <div className="i-ph:caret-left text-sm" />
        </button>
      )}

      {/* Tabs container */}
      <div
        ref={tabsContainerRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-hide"
        onScroll={updateScrollState}
        onDoubleClick={handleDoubleClick}
      >
        {sortedTabs.map((filePath) => {
          const fileName = filePath.split('/').pop() || filePath;
          const isActive = filePath === selectedFile;
          const isUnsaved = unsavedFiles?.has(filePath);
          const isPinned = isPinnedTab(filePath);
          const tabIndex = getTabIndex(filePath);
          const isDragging = draggedIndex === tabIndex;
          const isDragOver = dragOverIndex === tabIndex;

          // Get file icon
          const iconClass = getFileIcon(fileName);

          return (
            <div
              key={filePath}
              draggable
              onClick={() => handleTabClick(filePath)}
              onMouseDown={(e) => handleMiddleClick(e, filePath)}
              onContextMenu={(e) => handleContextMenu(e, filePath)}
              onDragStart={(e) => handleDragStart(e, tabIndex)}
              onDragOver={(e) => handleDragOver(e, tabIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, tabIndex)}
              onDragEnd={handleDragEnd}
              className={classNames(
                'group flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer border-r border-bolt-elements-borderColor',
                'hover:bg-bolt-elements-background-depth-3 transition-colors select-none',
                {
                  'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary': isActive,
                  'text-bolt-elements-textSecondary': !isActive,
                  'opacity-50': isDragging,
                  'border-l-2 border-l-blue-500': isDragOver,
                  'border-l-2 border-l-amber-500': isPinned,
                }
              )}
              title={filePath}
            >
              {/* Pin icon for pinned tabs */}
              {isPinned && (
                <div className="i-ph:push-pin-fill text-amber-500 text-xs flex-shrink-0" />
              )}

              {/* File icon */}
              <span className={classNames(iconClass, 'text-base flex-shrink-0')} />

              {/* File name - shorter for pinned tabs */}
              <span className={classNames(
                'truncate',
                isPinned ? 'max-w-[60px]' : 'max-w-[120px]'
              )}>
                {fileName}
              </span>

              {/* Unsaved indicator */}
              {isUnsaved && (
                <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
              )}

              {/* Close button - hidden for pinned tabs unless hovering */}
              <button
                onClick={(e) => handleTabClose(e, filePath)}
                className={classNames(
                  'flex items-center justify-center w-4 h-4 bg-transparent border-none hover:bg-bolt-elements-background-depth-4 rounded transition-all',
                  {
                    'opacity-0 group-hover:opacity-100': !isActive && !isPinned,
                    'opacity-100': isActive && !isPinned,
                    'hidden group-hover:flex': isPinned,
                  }
                )}
                title="Close tab"
              >
                <div className="i-ph:x text-xs" />
              </button>
            </div>
          );
        })}

        {/* Empty area for double-click */}
        <div className="tabs-empty-area flex-1 min-w-[50px] h-full" />
      </div>

      {/* Scroll right button */}
      {canScrollRight && (
        <button
          onClick={scrollRight}
          className="flex-shrink-0 flex items-center justify-center w-6 h-full hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors z-10 border-l border-bolt-elements-borderColor"
          title="Scroll tabs right"
        >
          <div className="i-ph:caret-right text-sm" />
        </button>
      )}

      {/* Context Menu */}
      {contextMenu.isOpen && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isPinned={isPinnedTab(contextMenu.filePath)}
          onClose={handleClose}
          onCloseOthers={handleCloseOthers}
          onCloseAll={handleCloseAll}
          onCloseToRight={handleCloseToRight}
          onCopyPath={handleCopyPath}
          onRevealInTree={onRevealInTree ? handleRevealInTree : undefined}
          onTogglePin={handleTogglePin}
          onDismiss={closeContextMenu}
        />
      )}
    </div>
  );
});

EditorTabs.displayName = 'EditorTabs';

// Context Menu Component
interface TabContextMenuProps {
  x: number;
  y: number;
  isPinned: boolean;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onCloseToRight: () => void;
  onCopyPath: () => void;
  onRevealInTree?: () => void;
  onTogglePin: () => void;
  onDismiss: () => void;
}

const TabContextMenu = memo(({
  x,
  y,
  isPinned,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseToRight,
  onCopyPath,
  onRevealInTree,
  onTogglePin,
  onDismiss,
}: TabContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to keep menu in viewport
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 8;
      }
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 8;
      }

      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  const menuItems = [
    { label: 'Close', icon: 'i-ph:x', onClick: onClose },
    { label: 'Close Others', icon: 'i-ph:x-circle', onClick: onCloseOthers },
    { label: 'Close All', icon: 'i-ph:x-square', onClick: onCloseAll },
    { label: 'Close to the Right', icon: 'i-ph:arrow-right', onClick: onCloseToRight },
    { type: 'divider' as const },
    { label: isPinned ? 'Unpin Tab' : 'Pin Tab', icon: isPinned ? 'i-ph:push-pin-slash' : 'i-ph:push-pin', onClick: onTogglePin },
    { type: 'divider' as const },
    { label: 'Copy Path', icon: 'i-ph:copy', onClick: onCopyPath },
    ...(onRevealInTree ? [{ label: 'Reveal in File Tree', icon: 'i-ph:tree-structure', onClick: onRevealInTree }] : []),
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] py-1 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg shadow-lg"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, index) => {
        if (item.type === 'divider') {
          return (
            <div
              key={`divider-${index}`}
              className="my-1 border-t border-bolt-elements-borderColor"
            />
          );
        }

        return (
          <button
            key={item.label}
            onClick={item.onClick}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary transition-colors text-left"
          >
            <span className={classNames(item.icon, 'text-base')} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
});

TabContextMenu.displayName = 'TabContextMenu';
