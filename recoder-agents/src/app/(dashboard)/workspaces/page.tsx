'use client';

import { useState } from 'react';
import {
  FolderOpen,
  Folder,
  Users,
  Bot,
  MessageSquare,
  Plus,
  Trash2,
  Settings,
  Activity,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useWorkspaces,
  useCreateWorkspace,
  useUpdateWorkspace,
  useDeleteWorkspace,
  useAddAgentToWorkspace,
  useRemoveAgentFromWorkspace,
  useAddThreadToWorkspace,
  useRemoveThreadFromWorkspace,
  useWorkspaceActivity,
} from '@/hooks/agents/use-workspace-management';
import type { Workspace } from '@/lib/api/workspace-management';

// ─── Constants ───────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#3b82f6',
  '#8b5cf6',
];

const ICON_OPTIONS = [
  { value: 'folder', label: 'Folder' },
  { value: 'briefcase', label: 'Briefcase' },
  { value: 'star', label: 'Star' },
  { value: 'zap', label: 'Zap' },
  { value: 'heart', label: 'Heart' },
  { value: 'code', label: 'Code' },
];

// ─── WorkspaceFormDialog ──────────────────────────────────────────────────────

interface WorkspaceFormState {
  workspace_name: string;
  description: string;
  color: string;
  icon: string;
  is_default: boolean;
}

const DEFAULT_FORM: WorkspaceFormState = {
  workspace_name: '',
  description: '',
  color: '#6366f1',
  icon: 'folder',
  is_default: false,
};

interface WorkspaceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: WorkspaceFormState;
  onSubmit: (data: WorkspaceFormState) => Promise<void>;
  submitting: boolean;
}

function WorkspaceFormDialog({
  open,
  onOpenChange,
  title,
  initial = DEFAULT_FORM,
  onSubmit,
  submitting,
}: WorkspaceFormDialogProps) {
  const [form, setForm] = useState<WorkspaceFormState>(initial);

  // Reset form when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) setForm(initial);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Workspace Name</label>
            <Input
              placeholder="My Workspace"
              value={form.workspace_name}
              onChange={(e) => setForm((f) => ({ ...f, workspace_name: e.target.value }))}
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Input
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Color</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: form.color === c ? 'white' : 'transparent',
                    outline: form.color === c ? `2px solid ${c}` : 'none',
                  }}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                />
              ))}
            </div>
          </div>

          {/* Icon select */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`px-3 py-1 rounded-md text-xs border transition-colors ${
                    form.icon === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted hover:bg-accent border-transparent'
                  }`}
                  onClick={() => setForm((f) => ({ ...f, icon: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Default checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm">Set as default workspace</span>
          </label>

          <Button
            onClick={() => onSubmit(form)}
            disabled={submitting || !form.workspace_name.trim()}
            className="w-full"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {title}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── WorkspaceCard ────────────────────────────────────────────────────────────

interface WorkspaceCardProps {
  workspace: Workspace;
  selected: boolean;
  onClick: () => void;
}

function WorkspaceCard({ workspace, selected, onClick }: WorkspaceCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all overflow-hidden ${
        selected
          ? 'border-primary/60 bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:bg-accent/40'
      }`}
    >
      {/* Color bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: workspace.color }} />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${workspace.color}22` }}
          >
            <FolderOpen className="h-5 w-5" style={{ color: workspace.color }} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{workspace.workspace_name}</span>
              {workspace.is_default && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  Default
                </Badge>
              )}
            </div>
            {workspace.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {workspace.description}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            {workspace.agent_count ?? workspace.agent_ids.length} agents
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            {workspace.thread_count ?? workspace.thread_ids.length} threads
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {workspace.member_count ?? 0} members
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── DetailPanel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  workspace: Workspace;
  onEdit: () => void;
  onDelete: () => void;
}

function DetailPanel({ workspace, onEdit, onDelete }: DetailPanelProps) {
  const [agentInput, setAgentInput] = useState('');
  const [threadInput, setThreadInput] = useState('');
  const addAgent = useAddAgentToWorkspace();
  const removeAgent = useRemoveAgentFromWorkspace();
  const addThread = useAddThreadToWorkspace();
  const removeThread = useRemoveThreadFromWorkspace();
  const { data: activityData, isLoading: activityLoading } = useWorkspaceActivity(workspace.id);

  const handleAddAgent = async () => {
    const id = agentInput.trim();
    if (!id) return;
    await addAgent.mutateAsync({ workspaceId: workspace.id, agentId: id });
    setAgentInput('');
  };

  const handleAddThread = async () => {
    const id = threadInput.trim();
    if (!id) return;
    await addThread.mutateAsync({ workspaceId: workspace.id, threadId: id });
    setThreadInput('');
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-3">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${workspace.color}22` }}
        >
          <Folder className="h-4 w-4" style={{ color: workspace.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm">{workspace.workspace_name}</h2>
          {workspace.description && (
            <p className="text-xs text-muted-foreground truncate">{workspace.description}</p>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="w-full rounded-none border-b bg-transparent px-4 justify-start gap-4 h-10">
          <TabsTrigger value="agents" className="text-xs px-0 pb-2 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            <Bot className="h-3.5 w-3.5 mr-1" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="threads" className="text-xs px-0 pb-2 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            <MessageSquare className="h-3.5 w-3.5 mr-1" />
            Threads
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs px-0 pb-2 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            <Activity className="h-3.5 w-3.5 mr-1" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Agents tab */}
        <TabsContent value="agents" className="p-4 space-y-3 mt-0">
          {workspace.agent_ids.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No agents in this workspace.</p>
          ) : (
            <ul className="space-y-1.5">
              {workspace.agent_ids.map((aid) => (
                <li
                  key={aid}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-mono truncate max-w-[180px]">{aid}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    disabled={removeAgent.isPending}
                    onClick={() =>
                      removeAgent.mutate({ workspaceId: workspace.id, agentId: aid })
                    }
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Agent ID"
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAgent()}
              className="text-xs h-8"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3"
              disabled={addAgent.isPending || !agentInput.trim()}
              onClick={handleAddAgent}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TabsContent>

        {/* Threads tab */}
        <TabsContent value="threads" className="p-4 space-y-3 mt-0">
          {workspace.thread_ids.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No threads in this workspace.</p>
          ) : (
            <ul className="space-y-1.5">
              {workspace.thread_ids.map((tid) => (
                <li
                  key={tid}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-mono truncate max-w-[180px]">{tid}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    disabled={removeThread.isPending}
                    onClick={() =>
                      removeThread.mutate({ workspaceId: workspace.id, threadId: tid })
                    }
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Thread ID"
              value={threadInput}
              onChange={(e) => setThreadInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddThread()}
              className="text-xs h-8"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3"
              disabled={addThread.isPending || !threadInput.trim()}
              onClick={handleAddThread}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TabsContent>

        {/* Activity tab */}
        <TabsContent value="activity" className="p-4 mt-0">
          {activityLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !activityData || activityData.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {activityData.map((evt) => (
                <li key={evt.id} className="flex gap-3 items-start">
                  <div className="mt-0.5">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        {evt.activity_type}
                      </Badge>
                      {evt.entity_type && (
                        <span className="text-xs text-muted-foreground">{evt.entity_type}</span>
                      )}
                    </div>
                    {evt.description && (
                      <p className="text-xs text-foreground mt-0.5">{evt.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(evt.occurred_at).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkspacesPage() {
  const { data: workspaces, isLoading } = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const selectedWorkspace = workspaces?.find((w) => w.id === selectedId) ?? null;

  const handleCreate = async (form: WorkspaceFormState) => {
    const ws = await createWorkspace.mutateAsync({
      workspace_name: form.workspace_name,
      description: form.description || undefined,
      color: form.color,
      icon: form.icon,
      is_default: form.is_default,
    });
    setSelectedId(ws.id);
    setCreateOpen(false);
  };

  const handleEdit = async (form: WorkspaceFormState) => {
    if (!selectedWorkspace) return;
    await updateWorkspace.mutateAsync({
      id: selectedWorkspace.id,
      data: {
        workspace_name: form.workspace_name,
        description: form.description || undefined,
        color: form.color,
        icon: form.icon,
        is_default: form.is_default,
      },
    });
    setEditOpen(false);
  };

  const handleDelete = async () => {
    if (!selectedWorkspace) return;
    if (!confirm(`Delete workspace "${selectedWorkspace.workspace_name}"?`)) return;
    await deleteWorkspace.mutateAsync(selectedWorkspace.id);
    setSelectedId(null);
  };

  return (
    <div className="flex flex-col h-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Workspaces</h1>
            <p className="text-sm text-muted-foreground">
              Organize your agents and threads into workspaces
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Workspace
        </Button>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !workspaces || workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="h-14 w-14 text-muted-foreground/40 mb-4" />
          <h3 className="text-base font-medium">No workspaces yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            No workspaces yet. Create one to organize your agents and threads.
          </p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Workspace
          </Button>
        </div>
      ) : (
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Workspace grid */}
          <div
            className={`grid gap-3 content-start ${
              selectedWorkspace
                ? 'w-[55%] grid-cols-1 md:grid-cols-2'
                : 'flex-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {workspaces.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                selected={ws.id === selectedId}
                onClick={() => setSelectedId(ws.id === selectedId ? null : ws.id)}
              />
            ))}
          </div>

          {/* Detail panel */}
          {selectedWorkspace && (
            <div className="flex-1 min-w-0">
              <DetailPanel
                workspace={selectedWorkspace}
                onEdit={() => setEditOpen(true)}
                onDelete={handleDelete}
              />
            </div>
          )}
        </div>
      )}

      {/* Create dialog */}
      <WorkspaceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Workspace"
        onSubmit={handleCreate}
        submitting={createWorkspace.isPending}
      />

      {/* Edit dialog */}
      {selectedWorkspace && (
        <WorkspaceFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          title="Edit Workspace"
          initial={{
            workspace_name: selectedWorkspace.workspace_name,
            description: selectedWorkspace.description ?? '',
            color: selectedWorkspace.color,
            icon: selectedWorkspace.icon,
            is_default: selectedWorkspace.is_default,
          }}
          onSubmit={handleEdit}
          submitting={updateWorkspace.isPending}
        />
      )}
    </div>
  );
}

