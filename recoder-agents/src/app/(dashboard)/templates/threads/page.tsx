'use client';

import { useState } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Play,
  MessageSquare,
  BarChart3,
  Bot,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useThreadTemplates,
  useCreateThreadTemplate,
  useDeleteThreadTemplate,
  useCreateThreadFromTemplate,
} from '@/hooks/threads/use-thread-templates';
import { useAgents } from '@/hooks/agents/use-agents';
import { toast } from '@/lib/toast';

const CATEGORIES = ['general', 'coding', 'research', 'writing', 'analysis'] as const;

type CategoryFilter = (typeof CATEGORIES)[number] | 'all';

interface InitialMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function ThreadTemplatesPage() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAgentId, setNewAgentId] = useState<string>('none');
  const [newCategory, setNewCategory] = useState<string>('general');
  const [newMessages, setNewMessages] = useState<InitialMessage[]>([]);

  const { data: templates = [], isLoading } = useThreadTemplates(
    categoryFilter === 'all' ? undefined : categoryFilter
  );
  const createTemplate = useCreateThreadTemplate();
  const deleteTemplate = useDeleteThreadTemplate();
  const createFromTemplate = useCreateThreadFromTemplate();
  const { data: agentsData } = useAgents({ limit: 50 });

  const agents = agentsData?.agents ?? agentsData ?? [];

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    try {
      await createTemplate.mutateAsync({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        agent_id: newAgentId !== 'none' ? newAgentId : undefined,
        initial_messages: newMessages.filter((m) => m.content.trim()),
        category: newCategory,
      });
      toast.success('Template created');
      setShowCreateDialog(false);
      resetForm();
    } catch {
      toast.error('Failed to create template');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const handleUse = async (id: string) => {
    try {
      await createFromTemplate.mutateAsync(id);
    } catch {
      toast.error('Failed to create thread from template');
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewDescription('');
    setNewAgentId('none');
    setNewCategory('general');
    setNewMessages([]);
  };

  const addMessage = () => {
    setNewMessages((prev) => [...prev, { role: 'user', content: '' }]);
  };

  const removeMessage = (index: number) => {
    setNewMessages((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMessage = (index: number, field: 'role' | 'content', value: string) => {
    setNewMessages((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      )
    );
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId || !Array.isArray(agents)) return null;
    const agent = agents.find((a: any) => a.agent_id === agentId);
    return agent?.name ?? null;
  };

  return (
    <div className="min-h-[100dvh] py-6 sm:py-8">
      <div className="container mx-auto max-w-5xl px-3 sm:px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold">Thread Templates</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Save and reuse your best conversation starters
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Template</span>
          </Button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          <Button
            variant={categoryFilter === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setCategoryFilter('all')}
          >
            All
          </Button>
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={categoryFilter === cat ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCategoryFilter(cat)}
              className="capitalize"
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Template grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-4 animate-pulse"
              >
                <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-full mb-4" />
                <div className="h-8 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No thread templates yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Save your best conversation starters as templates. Click &quot;New Template&quot; to get started, or save any thread as a template from the thread header.
            </p>
            <Button onClick={() => setShowCreateDialog(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Your First Template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => {
              const agentName = getAgentName(template.agent_id);
              const messageCount = Array.isArray(template.initial_messages)
                ? template.initial_messages.length
                : 0;

              return (
                <div
                  key={template.id}
                  className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-sm line-clamp-1">{template.name}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {template.category}
                    </span>
                  </div>

                  {template.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {agentName && (
                      <span className="flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        {agentName}
                      </span>
                    )}
                    {messageCount > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {messageCount} msg{messageCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" />
                      {template.usage_count} use{template.usage_count !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-auto pt-2">
                    <Button
                      size="sm"
                      className="gap-1.5 flex-1"
                      onClick={() => handleUse(template.id)}
                      disabled={createFromTemplate.isPending}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Use
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                      onClick={() => handleDelete(template.id)}
                      disabled={deleteTemplate.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Thread Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Code Review Session"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What this template is for..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agent (optional)</Label>
              <Select value={newAgentId} onValueChange={setNewAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="No specific agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific agent</SelectItem>
                  {Array.isArray(agents) &&
                    agents.map((agent: any) => (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Initial Messages</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMessage}
                  className="gap-1 h-7 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  Add Message
                </Button>
              </div>
              {newMessages.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No initial messages. The thread will start empty.
                </p>
              )}
              <div className="space-y-3">
                {newMessages.map((msg, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Select
                        value={msg.role}
                        onValueChange={(v) => updateMessage(i, 'role', v)}
                      >
                        <SelectTrigger className="w-28 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="assistant">Assistant</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMessage(i)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      value={msg.content}
                      onChange={(e) => updateMessage(i, 'content', e.target.value)}
                      placeholder="Message content..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createTemplate.isPending}>
              {createTemplate.isPending ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
