'use client';

import { useState } from 'react';
import { Folder, FolderOpen, Plus, Pencil, Trash2, Palette, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useThreadFolders,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
} from '@/hooks/threads/use-thread-folders';
import { toast } from '@/lib/toast';

interface ThreadFolderListProps {
  activeFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
}

const FOLDER_COLORS = [
  '#6b7280', // gray
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export function ThreadFolderList({ activeFolderId, onFolderSelect }: ThreadFolderListProps) {
  const { data: folders = [], isLoading } = useThreadFolders();
  const createMutation = useCreateFolder();
  const updateMutation = useUpdateFolder();
  const deleteMutation = useDeleteFolder();

  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Rename state
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  // Color picker dialog
  const [colorFolderId, setColorFolderId] = useState<string | null>(null);

  if (isLoading) return null;

  // Only top-level folders (no parent)
  const topFolders = folders.filter((f) => !f.parent_id);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createMutation.mutate(
      { name: newFolderName.trim() },
      {
        onSuccess: () => {
          setNewFolderName('');
          setIsCreating(false);
          toast.success('Folder created');
        },
        onError: (e) => {
          toast.error(e.message || 'Failed to create folder');
        },
      }
    );
  };

  const handleRename = (folderId: string) => {
    if (!renameName.trim()) return;
    updateMutation.mutate(
      { folderId, data: { name: renameName.trim() } },
      {
        onSuccess: () => {
          setRenameFolderId(null);
          setRenameName('');
          toast.success('Folder renamed');
        },
        onError: (e) => {
          toast.error(e.message || 'Failed to rename folder');
        },
      }
    );
  };

  const handleDelete = (folderId: string) => {
    deleteMutation.mutate(folderId, {
      onSuccess: () => {
        if (activeFolderId === folderId) {
          onFolderSelect(null);
        }
        toast.success('Folder deleted');
      },
      onError: () => {
        toast.error('Failed to delete folder');
      },
    });
  };

  const handleColorChange = (folderId: string, color: string) => {
    updateMutation.mutate(
      { folderId, data: { color } },
      {
        onSuccess: () => {
          setColorFolderId(null);
          toast.success('Color updated');
        },
      }
    );
  };

  if (topFolders.length === 0 && !isCreating) {
    return (
      <div className="px-2.5 pt-1 pb-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs text-muted-foreground w-full justify-start gap-1"
          onClick={() => setIsCreating(true)}
        >
          <Plus className="h-3 w-3" />
          New Folder
        </Button>
      </div>
    );
  }

  return (
    <div className="px-1 pt-1 pb-1">
      {/* All Threads option */}
      <button
        type="button"
        onClick={() => onFolderSelect(null)}
        className={cn(
          'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors',
          activeFolderId === null
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
        )}
      >
        <Folder className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate flex-1 text-left">All Threads</span>
      </button>

      {/* Folder list */}
      {topFolders.map((folder) => {
        const isActive = activeFolderId === folder.id;
        const FolderIcon = isActive ? FolderOpen : Folder;

        if (renameFolderId === folder.id) {
          return (
            <div key={folder.id} className="flex items-center gap-1 px-1 py-0.5">
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(folder.id);
                  if (e.key === 'Escape') {
                    setRenameFolderId(null);
                    setRenameName('');
                  }
                }}
                className="h-7 text-xs flex-1"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => {
                  setRenameFolderId(null);
                  setRenameName('');
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        }

        return (
          <ContextMenu key={folder.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={() => onFolderSelect(isActive ? null : folder.id)}
                className={cn(
                  'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors group',
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <FolderIcon
                  className="h-3.5 w-3.5 flex-shrink-0"
                  style={{ color: folder.color }}
                />
                <span className="truncate flex-1 text-left">{folder.name}</span>
                {typeof folder.thread_count === 'number' && folder.thread_count > 0 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground/70 bg-muted/50 rounded px-1">
                    {folder.thread_count}
                  </span>
                )}
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={() => {
                  setRenameFolderId(folder.id);
                  setRenameName(folder.name);
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setColorFolderId(folder.id)}>
                <Palette className="h-3.5 w-3.5 mr-2" /> Change color
              </ContextMenuItem>
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => handleDelete(folder.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}

      {/* Create folder inline */}
      {isCreating ? (
        <div className="flex items-center gap-1 px-1 py-0.5">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') {
                setIsCreating(false);
                setNewFolderName('');
              }
            }}
            placeholder="Folder name"
            className="h-7 text-xs flex-1"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={() => {
              setIsCreating(false);
              setNewFolderName('');
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs text-muted-foreground w-full justify-start gap-1"
          onClick={() => setIsCreating(true)}
        >
          <Plus className="h-3 w-3" />
          New Folder
        </Button>
      )}

      {/* Color picker dialog */}
      <Dialog open={!!colorFolderId} onOpenChange={(open) => !open && setColorFolderId(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Choose Folder Color</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2 py-2">
            {FOLDER_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => colorFolderId && handleColorChange(colorFolderId, color)}
                className={cn(
                  'w-10 h-10 rounded-lg border-2 transition-all mx-auto',
                  folders.find((f) => f.id === colorFolderId)?.color === color
                    ? 'border-foreground scale-110'
                    : 'border-transparent hover:border-muted-foreground/30'
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setColorFolderId(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
