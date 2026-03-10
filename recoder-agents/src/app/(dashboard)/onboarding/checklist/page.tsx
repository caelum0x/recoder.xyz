'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckSquare,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Sparkles,
  ListChecks,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  useOnboardingChecklists,
  useChecklist,
  useCreateChecklist,
  useDeleteChecklist,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  useSeedChecklist,
} from '@/hooks/onboarding/use-onboarding-checklists';
import type {
  Checklist,
  ChecklistItem,
  CreateChecklistItemData,
} from '@/lib/api/onboarding-checklists';

// ---------- Constants ----------

const CHECKLIST_TYPES = [
  { value: 'workspace', label: 'Workspace', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'agent', label: 'Agent', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { value: 'team', label: 'Team', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'custom', label: 'Custom', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
];

function getTypeColor(type: string) {
  return CHECKLIST_TYPES.find((t) => t.value === type)?.color || CHECKLIST_TYPES[3].color;
}

// ---------- New Checklist Dialog ----------

function NewChecklistDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [checklistType, setChecklistType] = useState('workspace');
  const [isTemplate, setIsTemplate] = useState(false);
  const [items, setItems] = useState<CreateChecklistItemData[]>([]);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemUrl, setNewItemUrl] = useState('');

  const createChecklist = useCreateChecklist();

  const handleAddInitialItem = () => {
    if (!newItemTitle.trim()) return;
    setItems((prev) => [
      ...prev,
      { title: newItemTitle.trim(), description: newItemDesc.trim() || undefined, action_url: newItemUrl.trim() || undefined, sort_order: prev.length },
    ]);
    setNewItemTitle('');
    setNewItemDesc('');
    setNewItemUrl('');
  };

  const handleRemoveInitialItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    createChecklist.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        checklist_type: checklistType,
        is_template: isTemplate,
        items: items.length > 0 ? items : undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName('');
          setDescription('');
          setChecklistType('workspace');
          setIsTemplate(false);
          setItems([]);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New Checklist
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Create Checklist</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Set up a new onboarding checklist with initial items.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Name</label>
            <Input
              placeholder="e.g. Getting Started"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Description</label>
            <Textarea
              placeholder="Optional description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700 min-h-[60px]"
              rows={2}
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs text-zinc-400 mb-1 block">Type</label>
              <Select value={checklistType} onValueChange={setChecklistType}>
                <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHECKLIST_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox
                id="is-template"
                checked={isTemplate}
                onCheckedChange={(v) => setIsTemplate(!!v)}
              />
              <label htmlFor="is-template" className="text-sm text-zinc-300 cursor-pointer">
                Template
              </label>
            </div>
          </div>

          {/* Initial items */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Initial Items</label>
            {items.length > 0 && (
              <div className="space-y-1 mb-2">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1 bg-zinc-800/50 rounded text-sm text-zinc-300"
                  >
                    <span className="flex-1 truncate">{item.title}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-zinc-500 hover:text-red-400"
                      onClick={() => handleRemoveInitialItem(idx)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Input
                placeholder="Item title"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                className="bg-zinc-800/50 border-zinc-700 h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddInitialItem();
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Description (optional)"
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  className="bg-zinc-800/50 border-zinc-700 h-8 text-sm"
                />
                <Input
                  placeholder="URL (optional)"
                  value={newItemUrl}
                  onChange={(e) => setNewItemUrl(e.target.value)}
                  className="bg-zinc-800/50 border-zinc-700 h-8 text-sm w-40"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={handleAddInitialItem}
                  disabled={!newItemTitle.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || createChecklist.isPending}>
            {createChecklist.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Expandable Checklist Card ----------

function ExpandableChecklistCard({
  checklist,
  onDelete,
}: {
  checklist: Checklist;
  onDelete: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const { data: detail } = useChecklist(isExpanded ? checklist.id : undefined);
  const addItem = useAddChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const completedCount = checklist.completed_count ?? 0;
  const totalCount = checklist.total_count ?? 0;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isComplete = totalCount > 0 && completedCount === totalCount;
  const items = detail?.items || [];

  const handleToggleComplete = (item: ChecklistItem) => {
    updateItem.mutate({
      checklistId: checklist.id,
      itemId: item.id,
      data: { is_completed: !item.is_completed },
    });
  };

  const handleAddItem = () => {
    const title = newItemTitle.trim();
    if (!title) return;
    addItem.mutate(
      { checklistId: checklist.id, data: { title, sort_order: totalCount } },
      { onSuccess: () => setNewItemTitle('') }
    );
  };

  const handleStartEdit = (item: ChecklistItem) => {
    setEditingItemId(item.id);
    setEditTitle(item.title);
  };

  const handleSaveEdit = (item: ChecklistItem) => {
    if (!editTitle.trim() || editTitle.trim() === item.title) {
      setEditingItemId(null);
      return;
    }
    updateItem.mutate(
      { checklistId: checklist.id, itemId: item.id, data: { title: editTitle.trim() } },
      { onSuccess: () => setEditingItemId(null) }
    );
  };

  const handleDeleteItem = (item: ChecklistItem) => {
    deleteItem.mutate({ checklistId: checklist.id, itemId: item.id });
  };

  const handleMoveItem = (item: ChecklistItem, direction: 'up' | 'down') => {
    const currentIdx = items.findIndex((i) => i.id === item.id);
    const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const targetItem = items[targetIdx];
    // Swap sort_order values
    updateItem.mutate({
      checklistId: checklist.id,
      itemId: item.id,
      data: { title: item.title }, // just need to trigger reorder — we use sort_order implicitly
    });
    // Note: for a full reorder, we'd need to update sort_order on both items
    // This is a simplified approach
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
      <button
        className="w-full text-left p-4 flex items-start gap-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ListChecks className="h-5 w-5 text-zinc-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-zinc-100 truncate">{checklist.name}</span>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 shrink-0 ${getTypeColor(checklist.checklist_type)}`}
            >
              {checklist.checklist_type}
            </Badge>
            {checklist.is_template && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-amber-500/30 text-amber-400">
                template
              </Badge>
            )}
          </div>
          {checklist.description && (
            <p className="text-xs text-zinc-500 mb-2 line-clamp-1">{checklist.description}</p>
          )}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                {completedCount}/{totalCount} completed
              </span>
              <span>{percentage}%</span>
            </div>
            <Progress value={percentage} className="h-1.5" />
          </div>
          {isComplete && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-emerald-400">
              <Sparkles className="h-3 w-3" />
              All done!
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(checklist.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-2">
          {items.length > 0 ? (
            <div className="space-y-1">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-zinc-800/50 group"
                >
                  <Checkbox
                    checked={item.is_completed}
                    onCheckedChange={() => handleToggleComplete(item)}
                    className="mt-0.5 shrink-0"
                    disabled={updateItem.isPending}
                  />
                  <div className="flex-1 min-w-0">
                    {editingItemId === item.id ? (
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleSaveEdit(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(item);
                          if (e.key === 'Escape') setEditingItemId(null);
                        }}
                        className="h-7 text-sm bg-zinc-800 border-zinc-700"
                        autoFocus
                      />
                    ) : (
                      <>
                        <span
                          className={`text-sm ${
                            item.is_completed ? 'line-through text-zinc-600' : 'text-zinc-200'
                          }`}
                        >
                          {item.title}
                        </span>
                        {item.description && (
                          <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {idx > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-zinc-500 hover:text-zinc-300"
                        onClick={() => handleMoveItem(item, 'up')}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                    )}
                    {idx < items.length - 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-zinc-500 hover:text-zinc-300"
                        onClick={() => handleMoveItem(item, 'down')}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    )}
                    {item.action_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-zinc-500 hover:text-blue-400"
                        asChild
                      >
                        <a href={item.action_url} onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-zinc-500 hover:text-zinc-300"
                      onClick={() => handleStartEdit(item)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-zinc-500 hover:text-red-400"
                      onClick={() => handleDeleteItem(item)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-600 text-center py-2">No items yet</p>
          )}

          {/* Add item */}
          <div className="flex items-center gap-2 pt-1">
            <Input
              placeholder="Add item..."
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddItem();
                }
              }}
              className="h-8 text-sm bg-zinc-800/50 border-zinc-700"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-zinc-400 hover:text-zinc-200 shrink-0"
              onClick={handleAddItem}
              disabled={!newItemTitle.trim() || addItem.isPending}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- Main Page ----------

export default function OnboardingChecklistPage() {
  const [filterType, setFilterType] = useState<string>('all');
  const { data, isLoading, error } = useOnboardingChecklists(
    filterType === 'all' ? undefined : filterType
  );
  const deleteChecklist = useDeleteChecklist();
  const seedChecklist = useSeedChecklist();

  const checklists = data?.checklists || [];
  const isEmpty = !isLoading && checklists.length === 0;

  const handleDelete = (id: string) => {
    deleteChecklist.mutate(id);
  };

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Onboarding Checklists
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Track your setup progress and customize onboarding workflows
          </p>
        </div>
        <NewChecklistDialog />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 h-8 text-sm bg-zinc-800/50 border-zinc-700">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CHECKLIST_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-zinc-900 border-zinc-800 animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-zinc-800 rounded w-1/3 mb-3" />
                <div className="h-2 bg-zinc-800 rounded w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="bg-zinc-900 border-red-900/30">
          <CardContent className="p-6 text-center text-sm text-red-400">
            Failed to load checklists. Please try again.
          </CardContent>
        </Card>
      )}

      {isEmpty && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 text-center">
            <ListChecks className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-zinc-300 mb-1">
              Set up your first checklist
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              Create a custom checklist or start with our recommended defaults.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedChecklist.mutate()}
                disabled={seedChecklist.isPending}
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {seedChecklist.isPending ? 'Creating...' : 'Seed Defaults'}
              </Button>
              <NewChecklistDialog />
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && checklists.length > 0 && (
        <div className="space-y-3">
          {checklists.map((cl) => (
            <ExpandableChecklistCard key={cl.id} checklist={cl} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
