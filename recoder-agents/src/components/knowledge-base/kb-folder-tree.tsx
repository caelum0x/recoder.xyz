'use client';

import React, { useState, useCallback } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  MoreVerticalIcon,
  CopyIcon,
  MoveIcon,
  PencilIcon,
  TrashIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Folder } from '@/hooks/knowledge-base/use-folders';

interface KbFolderTreeProps {
  folders: Folder[];
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folderId: string, currentName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveFolder?: (folderId: string) => void;
  onDuplicateFolder?: (folderId: string) => void;
  folderEntryCounts?: Record<string, number>;
}

interface FolderNodeProps {
  folder: Folder;
  isActive: boolean;
  isExpanded: boolean;
  entryCount: number;
  onSelect: () => void;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove?: () => void;
  onDuplicate?: () => void;
  depth?: number;
}

function FolderNode({
  folder,
  isActive,
  isExpanded,
  entryCount,
  onSelect,
  onToggle,
  onRename,
  onDelete,
  onMove,
  onDuplicate,
  depth = 0,
}: FolderNodeProps) {
  return (
    <div
      className={`
        group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm
        transition-colors select-none
        ${isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }
      `}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      onClick={onSelect}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex items-center justify-center h-5 w-5 shrink-0 rounded hover:bg-accent/50"
      >
        {isExpanded ? (
          <ChevronDownIcon className="h-3.5 w-3.5" />
        ) : (
          <ChevronRightIcon className="h-3.5 w-3.5" />
        )}
      </button>

      {isExpanded ? (
        <FolderOpenIcon className="h-4 w-4 shrink-0 text-amber-500" />
      ) : (
        <FolderIcon className="h-4 w-4 shrink-0 text-amber-500" />
      )}

      <span className="truncate flex-1 min-w-0">{folder.name}</span>

      {entryCount > 0 && (
        <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full shrink-0 tabular-nums">
          {entryCount}
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-accent/50 transition-opacity shrink-0"
          >
            <MoreVerticalIcon className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(); }}>
            <PencilIcon className="h-3.5 w-3.5 mr-2" />
            Rename
          </DropdownMenuItem>
          {onDuplicate && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
              <CopyIcon className="h-3.5 w-3.5 mr-2" />
              Duplicate
            </DropdownMenuItem>
          )}
          {onMove && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMove(); }}>
              <MoveIcon className="h-3.5 w-3.5 mr-2" />
              Move
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-3.5 w-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function KbFolderTree({
  folders,
  currentFolderId,
  onFolderSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onDuplicateFolder,
  folderEntryCounts,
}: KbFolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (folderId: string) => {
      onFolderSelect(folderId);
      // Auto-expand when selecting
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.add(folderId);
        return next;
      });
    },
    [onFolderSelect]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Folders
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onCreateFolder}
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* All Files root */}
      <div className="px-1 pt-1">
        <div
          className={`
            flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm
            transition-colors
            ${currentFolderId === null
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }
          `}
          onClick={() => onFolderSelect(null)}
        >
          <FolderIcon className="h-4 w-4 shrink-0" />
          <span>All Files</span>
        </div>
      </div>

      {/* Folder tree */}
      <div className="flex-1 overflow-y-auto px-1 py-1 space-y-0.5">
        {folders.map((folder) => (
          <FolderNode
            key={folder.folder_id}
            folder={folder}
            isActive={currentFolderId === folder.folder_id}
            isExpanded={expandedFolders.has(folder.folder_id)}
            entryCount={folderEntryCounts?.[folder.folder_id] ?? folder.entry_count ?? 0}
            onSelect={() => handleSelect(folder.folder_id)}
            onToggle={() => toggleExpand(folder.folder_id)}
            onRename={() => onRenameFolder(folder.folder_id, folder.name)}
            onDelete={() => onDeleteFolder(folder.folder_id)}
            onMove={onMoveFolder ? () => onMoveFolder(folder.folder_id) : undefined}
            onDuplicate={onDuplicateFolder ? () => onDuplicateFolder(folder.folder_id) : undefined}
          />
        ))}

        {folders.length === 0 && (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-muted-foreground">No folders yet</p>
            <Button
              variant="link"
              size="sm"
              className="text-xs mt-1 h-auto p-0"
              onClick={onCreateFolder}
            >
              Create your first folder
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
