'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, Hash, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useWorkspaces, useCreateWorkspace } from '@/hooks/workspaces/use-workspaces';
import { useWorkspaceStore } from '@/stores/workspace-store';

export default function WorkspacesPage() {
  const router = useRouter();
  const { data, isLoading } = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const [newName, setNewName] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim() || !newProjectId.trim()) return;
    const ws = await createWorkspace.mutateAsync({
      name: newName.trim(),
      projectId: newProjectId.trim(),
    });
    setCurrentWorkspace(ws.workspaceId);
    setDialogOpen(false);
    setNewName('');
    setNewProjectId('');
    router.push(`/workspaces/${ws.workspaceId}`);
  };

  return (
    <div className="flex flex-col h-full p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-agent collaboration environments for your projects
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Workspace
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Workspace</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="My Project Workspace"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Project ID</label>
                <Input
                  placeholder="project-id"
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={createWorkspace.isPending}
                className="w-full"
              >
                {createWorkspace.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Workspace
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data?.workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No workspaces yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Create a workspace to start collaborating with AI agents in a Slack-like environment
          </p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {data?.workspaces.map((ws) => (
            <button
              key={ws.workspaceId}
              className="text-left p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => {
                setCurrentWorkspace(ws.workspaceId);
                router.push(`/workspaces/${ws.workspaceId}`);
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Hash className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">{ws.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {ws.memberAgentIds.length} agent{ws.memberAgentIds.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {ws.settings.defaultOrchestrationPattern} pattern
                {ws.settings.autoRouting && ' · auto-routing'}
                {ws.settings.worktreeIsolation && ' · worktree isolation'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
