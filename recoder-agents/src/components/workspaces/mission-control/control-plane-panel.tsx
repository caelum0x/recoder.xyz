'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApprovalCard } from '@/components/workspaces/approval-card';
import { HandoffIndicator } from '@/components/workspaces/handoff-indicator';
import {
  usePendingApprovals,
} from '@/hooks/workspaces/use-approvals';
import {
  useAcceptHandoff,
  useActiveHandoffs,
  useDeclineHandoff,
} from '@/hooks/workspaces/use-handoffs';
import type { MissionControlSummary } from '@/hooks/workspaces/use-mission-control';

interface ControlPlanePanelProps {
  workspaceId: string;
  summary?: MissionControlSummary | null;
}

export function ControlPlanePanel({ workspaceId, summary = null }: ControlPlanePanelProps) {
  const { data: approvalsData, isLoading: approvalsLoading } = usePendingApprovals(workspaceId);
  const { data: handoffsData, isLoading: handoffsLoading } = useActiveHandoffs(workspaceId);
  const acceptHandoff = useAcceptHandoff();
  const declineHandoff = useDeclineHandoff();

  const approvals = approvalsData?.approvals ?? [];
  const handoffs = handoffsData?.handoffs ?? [];

  return (
    <div className="space-y-6">
      {summary ? (
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">Snapshot</h2>
            <p className="text-xs text-muted-foreground">
              Unified session, approval, handoff, and evidence totals
            </p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sessions</p>
              <p className="mt-1 text-lg font-semibold">
                {summary.pairedBridgeSessions}
              </p>
              <p className="text-xs text-muted-foreground">
                paired / {summary.localBridgeSessions} local
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Approvals</p>
              <p className="mt-1 text-lg font-semibold">
                {summary.pendingApprovals}
              </p>
              <p className="text-xs text-muted-foreground">
                pending / {summary.totalApprovals} total
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Handoffs</p>
              <p className="mt-1 text-lg font-semibold">
                {summary.activeHandoffs}
              </p>
              <p className="text-xs text-muted-foreground">
                active / {summary.totalHandoffs} total
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Evidence</p>
              <p className="mt-1 text-lg font-semibold">
                {summary.evidenceItems}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.previews} previews, {summary.logEvidence} logs
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Pending Approvals</h2>
          <p className="text-xs text-muted-foreground">
            Human decisions attached to the current workspace run state
          </p>
        </div>
        <div className="py-2">
          {approvalsLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : approvals.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">
              No pending approvals in this workspace.
            </p>
          ) : (
            approvals.map((approval) => (
              <ApprovalCard
                key={approval.approvalId}
                approvalId={approval.approvalId}
                workspaceId={approval.workspaceId}
                requestingAgent={approval.requestingAgentId}
                targetAgent={approval.targetAgentId}
                action={approval.action}
                details={approval.details}
                status={approval.status}
                createdAt={approval.createdAt}
                timeoutMs={approval.timeoutMs}
              />
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Active Handoffs</h2>
          <p className="text-xs text-muted-foreground">
            Delegations and reviews flowing through the shared control plane
          </p>
        </div>
        <div className="py-2">
          {handoffsLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : handoffs.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">
              No active handoffs in this workspace.
            </p>
          ) : (
            handoffs.map((handoff) => {
              const prompt =
                typeof handoff.context?.prompt === 'string' ? handoff.context.prompt : null;
              const isBusy =
                acceptHandoff.isPending || declineHandoff.isPending;

              return (
                <div key={handoff.handoffId} className="space-y-2 border-b px-4 py-3 last:border-b-0">
                  <HandoffIndicator
                    fromAgent={handoff.fromAgentId}
                    toAgent={handoff.toAgentId}
                    intent={handoff.intent}
                    contextTransferred={Boolean(handoff.context?.sourceTaskId)}
                  />
                  {prompt ? (
                    <p className="px-4 text-xs text-muted-foreground">
                      {prompt}
                    </p>
                  ) : null}
                  <div className="flex justify-end gap-2 px-4">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() =>
                        declineHandoff.mutate({
                          handoffId: handoff.handoffId,
                          workspaceId: handoff.workspaceId,
                        })
                      }
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      disabled={isBusy}
                      onClick={() =>
                        acceptHandoff.mutate({
                          handoffId: handoff.handoffId,
                          workspaceId: handoff.workspaceId,
                        })
                      }
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
