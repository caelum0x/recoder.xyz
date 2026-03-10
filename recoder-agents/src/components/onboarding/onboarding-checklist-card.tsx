'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckSquare,
  Plus,
  Trash2,
  ExternalLink,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  useUpdateChecklistItem,
  useAddChecklistItem,
  useDeleteChecklistItem,
} from '@/hooks/onboarding/use-onboarding-checklists';
import type { Checklist, ChecklistItem } from '@/lib/api/onboarding-checklists';

interface OnboardingChecklistCardProps {
  checklist: Checklist;
  defaultExpanded?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  workspace: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  agent: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  team: 'bg-green-500/20 text-green-400 border-green-500/30',
  custom: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

export function OnboardingChecklistCard({
  checklist,
  defaultExpanded = false,
}: OnboardingChecklistCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [newItemTitle, setNewItemTitle] = useState('');

  const updateItem = useUpdateChecklistItem();
  const addItem = useAddChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const items = checklist.items || [];
  const completedCount = checklist.completed_count ?? items.filter((i) => i.is_completed).length;
  const totalCount = checklist.total_count ?? items.length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isComplete = totalCount > 0 && completedCount === totalCount;

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
      {
        checklistId: checklist.id,
        data: { title, sort_order: totalCount },
      },
      {
        onSuccess: () => setNewItemTitle(''),
      }
    );
  };

  const handleDeleteItem = (item: ChecklistItem) => {
    deleteItem.mutate({
      checklistId: checklist.id,
      itemId: item.id,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <CheckSquare className="h-4 w-4 text-zinc-400 shrink-0" />
            <CardTitle className="text-sm font-medium text-zinc-100 truncate">
              {checklist.name}
            </CardTitle>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 shrink-0 ${TYPE_COLORS[checklist.checklist_type] || TYPE_COLORS.custom}`}
            >
              {checklist.checklist_type}
            </Badge>
            {checklist.is_template && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-amber-500/30 text-amber-400">
                template
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Progress */}
        <div className="space-y-1 mt-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {completedCount}/{totalCount} completed
            </span>
            <span>{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-1.5" />
        </div>

        {isComplete && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-400">
            <Sparkles className="h-3 w-3" />
            <span>All done! Great job completing this checklist.</span>
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-2">
          {/* Items list */}
          {items.length > 0 ? (
            <div className="space-y-1">
              {items.map((item) => (
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
                    <span
                      className={`text-sm leading-tight ${
                        item.is_completed
                          ? 'line-through text-zinc-600'
                          : 'text-zinc-200'
                      }`}
                    >
                      {item.title}
                    </span>
                    {item.description && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {item.action_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-zinc-500 hover:text-blue-400"
                        asChild
                      >
                        <a href={item.action_url}>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400"
                      onClick={() => handleDeleteItem(item)}
                      disabled={deleteItem.isPending}
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

          {/* Add item form */}
          <div className="flex items-center gap-2 pt-1">
            <Input
              placeholder="Add new item..."
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={handleKeyDown}
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
        </CardContent>
      )}
    </Card>
  );
}
