'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Star, Save, Trash2, MoreHorizontal, Filter, Check } from 'lucide-react';
import {
  useSavedFilters,
  useCreateFilter,
  useUpdateFilter,
  useDeleteFilter,
  useSetDefaultFilter,
} from '@/hooks/use-saved-filters';

interface SavedFilterBarProps {
  viewType: string;
  currentFilters: Record<string, any>;
  onApplyFilter: (filters: Record<string, any>) => void;
}

export function SavedFilterBar({
  viewType,
  currentFilters,
  onApplyFilter,
}: SavedFilterBarProps) {
  const { data: filters = [], isLoading } = useSavedFilters(viewType);
  const createFilter = useCreateFilter();
  const updateFilter = useUpdateFilter();
  const deleteFilter = useDeleteFilter();
  const setDefaultFilter = useSetDefaultFilter();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [renamingFilter, setRenamingFilter] = useState<{ id: string; name: string } | null>(null);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);

  const handleSave = () => {
    if (!filterName.trim()) return;
    createFilter.mutate(
      {
        name: filterName.trim(),
        view_type: viewType,
        filters: currentFilters,
      },
      {
        onSuccess: () => {
          setFilterName('');
          setSaveDialogOpen(false);
        },
      },
    );
  };

  const handleRename = () => {
    if (!renamingFilter || !filterName.trim()) return;
    updateFilter.mutate(
      { id: renamingFilter.id, name: filterName.trim() },
      {
        onSuccess: () => {
          setFilterName('');
          setRenamingFilter(null);
          setRenameDialogOpen(false);
        },
      },
    );
  };

  const handleApply = (filterId: string, filterData: Record<string, any>) => {
    setActiveFilterId(filterId);
    onApplyFilter(filterData);
  };

  const handleDelete = (id: string) => {
    deleteFilter.mutate(id, {
      onSuccess: () => {
        if (activeFilterId === id) {
          setActiveFilterId(null);
        }
      },
    });
  };

  const handleSetDefault = (id: string) => {
    setDefaultFilter.mutate(id);
  };

  const openRenameDialog = (id: string, name: string) => {
    setRenamingFilter({ id, name });
    setFilterName(name);
    setRenameDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5">
        <Filter className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs text-zinc-500">Loading filters...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap px-1 py-1.5">
        {filters.length > 0 && (
          <Filter className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        )}

        {filters.map((filter) => (
          <div key={filter.id} className="flex items-center group">
            <Badge
              variant={activeFilterId === filter.id ? 'default' : 'outline'}
              className={`cursor-pointer text-xs h-6 px-2 gap-1 transition-colors ${
                filter.is_default
                  ? 'border-amber-500/50 hover:border-amber-500'
                  : 'hover:bg-zinc-800'
              } ${
                activeFilterId === filter.id
                  ? 'bg-zinc-700 text-zinc-100'
                  : ''
              }`}
              onClick={() => handleApply(filter.id, filter.filters)}
            >
              {filter.is_default && (
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
              )}
              {activeFilterId === filter.id && !filter.is_default && (
                <Check className="h-3 w-3" />
              )}
              {filter.name}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem onClick={() => handleSetDefault(filter.id)}>
                  <Star className="h-3.5 w-3.5 mr-2" />
                  Set as Default
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openRenameDialog(filter.id, filter.name)}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-400 focus:text-red-400"
                  onClick={() => handleDelete(filter.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}

        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200"
          onClick={() => {
            setFilterName('');
            setSaveDialogOpen(true);
          }}
        >
          <Save className="h-3 w-3 mr-1" />
          Save Current
        </Button>
      </div>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Filter</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Filter name"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSaveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!filterName.trim() || createFilter.isPending}
            >
              {createFilter.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Filter</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="New filter name"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRenameDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRename}
              disabled={!filterName.trim() || updateFilter.isPending}
            >
              {updateFilter.isPending ? 'Saving...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
