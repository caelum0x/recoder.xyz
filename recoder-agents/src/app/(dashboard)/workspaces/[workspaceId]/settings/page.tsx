'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspace, useUpdateWorkspace } from '@/hooks/workspaces/use-workspaces';

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const wsId = params.workspaceId as string;
  const { data: workspace } = useWorkspace(wsId);
  const updateWorkspace = useUpdateWorkspace();

  const [name, setName] = useState(workspace?.name ?? '');
  const [autoRouting, setAutoRouting] = useState(workspace?.settings.autoRouting ?? false);
  const [approvalRequired, setApprovalRequired] = useState(workspace?.settings.approvalRequired ?? false);
  const [worktreeIsolation, setWorktreeIsolation] = useState(workspace?.settings.worktreeIsolation ?? false);
  const [maxConcurrent, setMaxConcurrent] = useState(workspace?.settings.maxConcurrentTasks ?? 5);
  const [pattern, setPattern] = useState(workspace?.settings.defaultOrchestrationPattern ?? 'direct');

  const handleSave = async () => {
    await updateWorkspace.mutateAsync({
      id: wsId,
      name: name || undefined,
      settings: {
        autoRouting,
        approvalRequired,
        worktreeIsolation,
        maxConcurrentTasks: maxConcurrent,
        defaultOrchestrationPattern: pattern as any,
      },
    });
  };

  if (!workspace) return null;

  return (
    <div className="flex flex-col h-full p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Workspace Settings</h1>

      <div className="space-y-6">
        <div>
          <Label>Workspace Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Agent Collaboration</h3>

          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-routing</Label>
              <p className="text-xs text-muted-foreground">Automatically route @mentions to capable agents</p>
            </div>
            <Switch checked={autoRouting} onCheckedChange={setAutoRouting} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Approval Required</Label>
              <p className="text-xs text-muted-foreground">Require human approval before delegations execute</p>
            </div>
            <Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Worktree Isolation</Label>
              <p className="text-xs text-muted-foreground">Create git worktrees for parallel agent work</p>
            </div>
            <Switch checked={worktreeIsolation} onCheckedChange={setWorktreeIsolation} />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Execution</h3>

          <div>
            <Label>Max Concurrent Tasks</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
              className="mt-1.5 w-32"
            />
          </div>

          <div>
            <Label>Default Orchestration Pattern</Label>
            <Select value={pattern} onValueChange={setPattern}>
              <SelectTrigger className="mt-1.5 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="fan-out">Fan-out</SelectItem>
                <SelectItem value="pipeline">Pipeline</SelectItem>
                <SelectItem value="competitive">Competitive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleSave} disabled={updateWorkspace.isPending}>
          {updateWorkspace.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
