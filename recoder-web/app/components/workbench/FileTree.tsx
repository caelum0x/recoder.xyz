import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import type { FileMap } from '~/lib/stores/files';
import { filesWithErrorsAtom, getFileErrorCount } from '~/lib/stores/errors';
import { classNames } from '~/utils/classNames';
import { createScopedLogger, renderLogger } from '~/utils/logger';

const logger = createScopedLogger('FileTree');

const NODE_PADDING_LEFT = 8;
const DEFAULT_HIDDEN_FILES = [/\/node_modules\//, /\/\.next/, /\/\.astro/];

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
  onFileCopy?: (filePath: string) => void;
  rootFolder?: string;
  hideRoot?: boolean;
  collapsed?: boolean;
  allowFolderSelection?: boolean;
  hiddenFiles?: Array<string | RegExp>;
  unsavedFiles?: Set<string>;
  className?: string;
}

export const FileTree = memo(
  ({
    files = {},
    onFileSelect,
    onFileCreate,
    onFolderCreate,
    onFileDelete,
    onFileRename,
    onFileCopy,
    selectedFile,
    rootFolder,
    hideRoot = false,
    collapsed = false,
    allowFolderSelection = false,
    hiddenFiles,
    className,
    unsavedFiles,
  }: Props) => {
    renderLogger.trace('FileTree');

    const filesWithErrors = useStore(filesWithErrorsAtom);
    const computedHiddenFiles = useMemo(() => [...DEFAULT_HIDDEN_FILES, ...(hiddenFiles ?? [])], [hiddenFiles]);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [newItemName, setNewItemName] = useState('');
    const [creatingIn, setCreatingIn] = useState<{ path: string; type: 'file' | 'folder' } | null>(null);

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

    return (
      <div className={classNames('text-sm relative', className)}>
        {filteredFileList.map((fileOrFolder) => {
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
                      className="w-full px-1 py-0.5 text-sm text-white bg-bolt-elements-background-depth-3 border border-blue-500 rounded outline-none"
                    />
                  </div>
                );
              }

              return (
                <File
                  key={fileOrFolder.id}
                  selected={selectedFile === fileOrFolder.fullPath}
                  file={fileOrFolder}
                  unsavedChanges={unsavedFiles?.has(fileOrFolder.fullPath)}
                  errorCount={errorCount}
                  onClick={() => {
                    onFileSelect?.(fileOrFolder.fullPath);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, fileOrFolder.fullPath, 'file')}
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
                      className="w-full px-1 py-0.5 text-sm text-white bg-bolt-elements-background-depth-3 border border-blue-500 rounded outline-none"
                    />
                  </div>
                );
              }

              return (
                <Folder
                  key={fileOrFolder.id}
                  folder={fileOrFolder}
                  selected={allowFolderSelection && selectedFile === fileOrFolder.fullPath}
                  collapsed={collapsedFolders.has(fileOrFolder.fullPath)}
                  onClick={() => {
                    toggleCollapseState(fileOrFolder.fullPath);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, fileOrFolder.fullPath, 'folder')}
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
                className="flex-1 px-1 py-0.5 text-sm text-white bg-bolt-elements-background-depth-3 border border-blue-500 rounded outline-none placeholder:text-gray-400"
              />
            </div>
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleNewFile}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3 flex items-center gap-2"
            >
              <span className="i-ph:file-plus" /> New File
            </button>
            <button
              onClick={handleNewFolder}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3 flex items-center gap-2"
            >
              <span className="i-ph:folder-plus" /> New Folder
            </button>
            <div className="border-t border-bolt-elements-borderColor my-1" />
            <button
              onClick={handleRename}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3 flex items-center gap-2"
            >
              <span className="i-ph:pencil" /> Rename
            </button>
            <button
              onClick={handleCopy}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3 flex items-center gap-2"
            >
              <span className="i-ph:copy" /> Copy Path
            </button>
            <div className="border-t border-bolt-elements-borderColor my-1" />
            <button
              onClick={handleDelete}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3 text-red-400 flex items-center gap-2"
            >
              <span className="i-ph:trash" /> Delete
            </button>
          </div>
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
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function Folder({ folder: { depth, name }, collapsed, selected = false, onClick, onContextMenu }: FolderProps) {
  return (
    <NodeButton
      className={classNames('group', {
        'bg-transparent text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive hover:bg-bolt-elements-item-backgroundActive':
          !selected,
        'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': selected,
      })}
      depth={depth}
      iconClasses={classNames({
        'i-ph:caret-right scale-98': collapsed,
        'i-ph:caret-down scale-98': !collapsed,
      })}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {name}
    </NodeButton>
  );
}

interface FileProps {
  file: FileNode;
  selected: boolean;
  unsavedChanges?: boolean;
  errorCount?: number;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function File({ file: { depth, name }, onClick, selected, unsavedChanges = false, errorCount = 0, onContextMenu }: FileProps) {
  return (
    <NodeButton
      className={classNames('group', {
        'bg-transparent hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-item-contentDefault': !selected,
        'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': selected,
      })}
      depth={depth}
      iconClasses={classNames('i-ph:file-duotone scale-98', {
        'group-hover:text-bolt-elements-item-contentActive': !selected,
        'text-red-500': errorCount > 0,
      })}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div
        className={classNames('flex items-center', {
          'group-hover:text-bolt-elements-item-contentActive': !selected,
        })}
      >
        <div className={classNames('flex-1 truncate pr-2', { 'text-red-400': errorCount > 0 })}>{name}</div>
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
}

function NodeButton({ depth, iconClasses, onClick, onContextMenu, className, children }: ButtonProps) {
  return (
    <button
      className={classNames(
        'flex items-center gap-1.5 w-full pr-2 border-2 border-transparent text-faded py-0.5',
        className,
      )}
      style={{ paddingLeft: `${6 + depth * NODE_PADDING_LEFT}px` }}
      onClick={() => onClick?.()}
      onContextMenu={onContextMenu}
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
