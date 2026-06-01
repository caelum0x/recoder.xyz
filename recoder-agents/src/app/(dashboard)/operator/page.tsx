'use client';

import { useEffect } from 'react';
import { Radar } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspaces } from '@/hooks/workspaces/use-workspaces';
import {
  useWorkspaceStore,
  useCurrentWorkspaceId,
} from '@/stores/workspace-store';
import { AgentRegistryPanel } from '@/components/operator/agent-registry-panel';
import { RunHistoryPanel } from '@/components/operator/run-history-panel';
import { PendingWorkPanel } from '@/components/operator/pending-work-panel';

/**
 * Operator surface for agents.recoder.xyz.
 *
 * Read-only operator visibility into the shared control-plane: workspace agents
 * (durable identity + health), recent runs (with timeline drill-down), and
 * pending approvals/handoffs. Sourced from the same docker-backend control-plane
 * endpoints that PM reads.
 */
export default function OperatorPage() {
  const { data: workspaceData } = useWorkspaces();
  const currentWorkspaceId = useCurrentWorkspaceId();
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);

  const workspaces = workspaceData?.workspaces ?? [];

  // Default to the first workspace once data loads and nothing is selected.
  useEffect(() => {
    if (!currentWorkspaceId && workspaces.length > 0) {
      setCurrentWorkspace(workspaces[0].workspaceId);
    }
  }, [currentWorkspaceId, workspaces, setCurrentWorkspace]);

  return (
    <div className="min-h-[100dvh]">
      <div className="container mx-auto max-w-6xl space-y-5 px-3 py-6 sm:px-4 sm:py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Radar className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Operator</h1>
            <p className="text-sm text-muted-foreground">
              Live workspace agents, runs, and pending approvals from the shared control plane
            </p>
          </div>
          <Select
            value={currentWorkspaceId ?? undefined}
            onValueChange={(v) => setCurrentWorkspace(v)}
          >
            <SelectTrigger className="h-9 w-[220px] text-sm">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.length === 0 ? (
                <SelectItem value="__none" disabled>
                  No workspaces
                </SelectItem>
              ) : (
                workspaces.map((ws) => (
                  <SelectItem key={ws.workspaceId} value={ws.workspaceId}>
                    {ws.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Grid: agents + pending work on the left, runs on the right */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <AgentRegistryPanel />
            <PendingWorkPanel workspaceId={currentWorkspaceId} />
          </div>
          <RunHistoryPanel workspaceId={currentWorkspaceId ?? undefined} />
        </div>
      </div>
    </div>
  );
}
