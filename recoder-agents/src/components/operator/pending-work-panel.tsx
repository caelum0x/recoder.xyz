'use client';

import { ArrowRightLeft, ShieldQuestion } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePendingApprovals } from '@/hooks/workspaces/use-approvals';
import { useActiveHandoffs } from '@/hooks/workspaces/use-handoffs';
import { formatRelative } from './format-relative';

interface PendingWorkPanelProps {
  workspaceId: string | null;
}

export function PendingWorkPanel({ workspaceId }: PendingWorkPanelProps) {
  const { data: approvals } = usePendingApprovals(workspaceId);
  const { data: handoffs } = useActiveHandoffs(workspaceId);

  const approvalList = approvals?.approvals ?? [];
  const handoffList = handoffs?.handoffs ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ShieldQuestion className="h-4 w-4 text-muted-foreground" />
          Pending Approvals &amp; Handoffs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!workspaceId && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Select a workspace to view pending approvals and handoffs
          </p>
        )}

        {workspaceId && (
          <>
            {/* Approvals */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ShieldQuestion className="h-3.5 w-3.5" /> Approvals
                </span>
                <span className="text-xs text-muted-foreground">{approvalList.length}</span>
              </div>
              {approvalList.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">No pending approvals</p>
              ) : (
                approvalList.map((a) => (
                  <div key={a.approvalId} className="rounded-lg border bg-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{a.action}</span>
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-amber-600">
                        {a.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {a.requestingAgentId} → {a.targetAgentId} · {formatRelative(a.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Handoffs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ArrowRightLeft className="h-3.5 w-3.5" /> Handoffs
                </span>
                <span className="text-xs text-muted-foreground">{handoffList.length}</span>
              </div>
              {handoffList.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">No active handoffs</p>
              ) : (
                handoffList.map((h) => (
                  <div key={h.handoffId} className="rounded-lg border bg-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{h.intent}</span>
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-blue-600">
                        {h.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {h.fromAgentId} → {h.toAgentId} · {formatRelative(h.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
