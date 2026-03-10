'use client';

import { useState, useCallback } from 'react';
import { Brain, Trash2, Plus, RefreshCw, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  useMemories,
  useMemoryStats,
  useMemorySettings,
  useUpdateMemorySettings,
  useCreateMemory,
  useDeleteMemory,
  useDeleteAllMemories,
} from '@/hooks/memory/use-memory';
import type { Memory } from '@/lib/api/memory';

const MEMORY_TYPES = [
  { value: undefined, label: 'All' },
  { value: 'fact', label: 'Facts' },
  { value: 'preference', label: 'Preferences' },
  { value: 'instruction', label: 'Instructions' },
  { value: 'context', label: 'Context' },
] as const;

const typeColors: Record<string, string> = {
  fact: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  preference: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  instruction: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  context: 'bg-green-500/10 text-green-600 dark:text-green-400',
  conversation_summary: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
};

export function MemorySettings() {
  const [newMemory, setNewMemory] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data: stats, isLoading: statsLoading } = useMemoryStats();
  const { data: memoriesData, isLoading: memoriesLoading, refetch } = useMemories(page, 50, typeFilter);
  const { data: settings } = useMemorySettings();

  const updateSettings = useUpdateMemorySettings();
  const createMemory = useCreateMemory();
  const deleteMutation = useDeleteMemory();
  const deleteAllMutation = useDeleteAllMemories();

  const memoryEnabled = settings?.memory_enabled ?? true;
  const memories = memoriesData?.memories ?? [];
  const totalPages = memoriesData?.pages ?? 1;
  const loading = statsLoading || memoriesLoading;

  const handleToggle = useCallback(() => {
    updateSettings.mutate(!memoryEnabled);
  }, [memoryEnabled, updateSettings]);

  const handleAdd = useCallback(() => {
    if (!newMemory.trim()) return;
    createMemory.mutate(
      { content: newMemory.trim(), memory_type: 'fact' },
      { onSuccess: () => setNewMemory('') }
    );
  }, [newMemory, createMemory]);

  const handleDelete = useCallback((memoryId: string) => {
    deleteMutation.mutate(memoryId);
  }, [deleteMutation]);

  const handleClearAll = useCallback(() => {
    if (!confirm('Delete all memories? This cannot be undone.')) return;
    deleteAllMutation.mutate();
  }, [deleteAllMutation]);

  const handleFilterChange = useCallback((type: string | undefined) => {
    setTypeFilter(type);
    setPage(1);
  }, []);

  return (
    <div className="p-4 sm:p-6 pb-12 sm:pb-6 space-y-5 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Memory</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Personalized context from your conversations
              </p>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Toggle + Stats */}
      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
        <div className="flex items-center gap-3">
          <Switch
            checked={memoryEnabled}
            onCheckedChange={handleToggle}
            disabled={updateSettings.isPending}
          />
          <div>
            <p className="text-sm font-medium">
              {memoryEnabled ? 'Memory is active' : 'Memory is paused'}
            </p>
            <p className="text-xs text-muted-foreground">
              {memoryEnabled
                ? 'Recoder learns from your conversations'
                : 'New memories will not be created'}
            </p>
          </div>
        </div>
        {stats && (
          <div className="text-right text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{stats.total_memories} / {stats.max_memories}</p>
            <p>memories used</p>
          </div>
        )}
      </div>

      {/* Add memory */}
      <div className="flex gap-2">
        <Input
          placeholder="Add a memory manually (e.g. 'I prefer TypeScript over JavaScript')"
          value={newMemory}
          onChange={e => setNewMemory(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          disabled={createMemory.isPending || !memoryEnabled}
        />
        <Button
          onClick={handleAdd}
          disabled={createMemory.isPending || !newMemory.trim() || !memoryEnabled}
          size="sm"
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {MEMORY_TYPES.map(({ value, label }) => (
          <button
            key={label}
            onClick={() => handleFilterChange(value)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
              typeFilter === value
                ? 'bg-primary text-primary-foreground'
                : 'bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {label}
            {value && stats?.memories_by_type[value] ? (
              <span className="ml-1 opacity-70">({stats.memories_by_type[value]})</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Memory list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Loading memories...
        </div>
      ) : memories.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{typeFilter ? 'No memories of this type' : 'No memories yet'}</p>
          <p className="text-sm mt-1">
            {typeFilter
              ? 'Try a different filter or add one manually above.'
              : 'Memories are automatically created as you chat with your agents. You can also add them manually above.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {memoriesData?.total ?? memories.length} {(memoriesData?.total ?? memories.length) === 1 ? 'memory' : 'memories'}
              {typeFilter ? ` (${typeFilter})` : ''}
            </p>
            {!typeFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                disabled={deleteAllMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear all
              </Button>
            )}
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {memories.map((memory: Memory) => (
              <div
                key={memory.memory_id}
                className="group flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">{memory.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${typeColors[memory.memory_type] || ''}`}>
                      {memory.memory_type}
                    </Badge>
                    {memory.confidence_score > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(memory.confidence_score * 100)}% confident
                      </span>
                    )}
                    {memory.created_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(memory.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 shrink-0"
                  onClick={() => handleDelete(memory.memory_id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Type breakdown */}
      {stats && Object.keys(stats.memories_by_type).length > 0 && (
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm font-medium mb-3">Memory types</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.memories_by_type).map(([type, count]) => (
              <button
                key={type}
                onClick={() => handleFilterChange(typeFilter === type ? undefined : type)}
                className="cursor-pointer"
              >
                <Badge
                  variant="secondary"
                  className={`${typeColors[type] || ''} ${typeFilter === type ? 'ring-1 ring-primary' : ''}`}
                >
                  {type}: {count}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
