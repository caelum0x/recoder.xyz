'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
  Inbox,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  usePendingApprovals,
  useApproveGate,
  useRejectGate,
} from '@/hooks/workflows/use-workflows';
import type { ApprovalGate } from '@/lib/api/workflows';

export default function ApprovalsInboxPage() {
  const { data: approvals, isLoading } = usePendingApprovals();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/workflows"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Workflows
        </Link>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
            <p className="text-sm text-muted-foreground">
              Workflow steps paused for human review before they continue.
            </p>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : !approvals || approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <Inbox className="h-6 w-6" />
          </div>
          <div>
            <p className="font-medium">All caught up</p>
            <p className="text-sm text-muted-foreground">
              No workflow steps are waiting on your approval right now.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {approvals.map((gate) => (
            <ApprovalCard key={gate.id} gate={gate} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ gate }: { gate: ApprovalGate }) {
  const approve = useApproveGate();
  const reject = useRejectGate();
  const [showContext, setShowContext] = useState(false);

  const handleApprove = async () => {
    try {
      await approve.mutateAsync(gate.id);
      toast.success('Approved — workflow resuming.');
    } catch {
      // handled by api layer
    }
  };

  const handleReject = async () => {
    try {
      await reject.mutateAsync(gate.id);
      toast.success('Rejected.');
    } catch {
      // handled by api layer
    }
  };

  const contextEntries = Object.entries(gate.context ?? {});
  const busy = approve.isPending || reject.isPending;

  return (
    <Card className={cn('border-amber-500/20', busy && 'opacity-70')}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {gate.workflow_name || 'Workflow'}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {gate.node_label || 'Approval gate'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Requested {new Date(gate.requested_at).toLocaleString()}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={handleApprove} disabled={busy}>
              {approve.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={handleReject} disabled={busy}>
              {reject.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
              )}
              Reject
            </Button>
          </div>
        </div>

        {contextEntries.length > 0 && (
          <div className="rounded-md border bg-muted/30">
            <button
              type="button"
              onClick={() => setShowContext((s) => !s)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Context ({contextEntries.length})
              {showContext ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {showContext && (
              <pre className="max-h-48 overflow-auto border-t px-3 py-2 text-[11px] leading-relaxed">
                {JSON.stringify(gate.context, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
