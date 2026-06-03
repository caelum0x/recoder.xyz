'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useControlPlaneSnapshot, useSLOMetrics } from '@/hooks/workspaces/use-mission-control';
import { AgentFleetOverview } from '@/components/workspaces/mission-control/agent-fleet-overview';
import { TaskPipelineView } from '@/components/workspaces/mission-control/task-pipeline-view';
import { SLODashboard } from '@/components/workspaces/mission-control/slo-dashboard';
import { ActivityTimeline } from '@/components/workspaces/mission-control/activity-timeline';
import { ControlPlanePanel } from '@/components/workspaces/mission-control/control-plane-panel';
import { TaskDetailDialog } from '@/components/workspaces/mission-control/task-detail-dialog';

export default function MissionControlPage() {
  const params = useParams();
  const wsId = params.workspaceId as string;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data: snapshot } = useControlPlaneSnapshot(wsId);
  const { data: metrics } = useSLOMetrics(wsId);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Mission Control</h1>
        <p className="text-sm text-muted-foreground">
          Real-time overview of your agent fleet, tasks, and performance
        </p>
      </div>

      {/* SLO Metrics */}
      <SLODashboard metrics={metrics ?? null} />

      {/* Agent Fleet */}
      <AgentFleetOverview />

      {/* Task Pipeline */}
      <TaskPipelineView
        tasks={(snapshot?.tasks as any[]) ?? []}
        onTaskClick={(taskId) => setSelectedTaskId(taskId)}
      />

      {/* Control-plane state */}
      <ControlPlanePanel workspaceId={wsId} summary={snapshot?.summary ?? null} />

      {/* Activity Timeline */}
      <ActivityTimeline
        workspaceId={wsId}
        onTaskClick={(taskId) => setSelectedTaskId(taskId)}
      />

      <TaskDetailDialog
        taskId={selectedTaskId}
        workspaceId={wsId}
        open={!!selectedTaskId}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null);
        }}
      />
    </div>
  );
}
