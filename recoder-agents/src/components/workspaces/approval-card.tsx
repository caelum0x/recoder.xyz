'use client';

import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, ShieldX, ShieldAlert, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useApproveAction, useRejectAction, useEscalateAction } from '@/hooks/workspaces/use-approvals';

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

type RiskLevel = 'high' | 'medium' | 'low';

function classifyRisk(action: string, details?: Record<string, unknown>): RiskLevel {
  const actionLower = action.toLowerCase();
  const filesChanged = typeof details?.filesChanged === 'number' ? details.filesChanged : 0;

  if (
    actionLower.includes('delete') ||
    actionLower.includes('deploy') ||
    actionLower.includes('production') ||
    actionLower.includes('force') ||
    filesChanged > 10
  ) {
    return 'high';
  }

  if (
    actionLower.includes('merge') ||
    actionLower.includes('write') ||
    actionLower.includes('modify') ||
    filesChanged > 3
  ) {
    return 'medium';
  }

  return 'low';
}

const RISK_STYLES: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  high: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
    label: 'High Risk',
  },
  medium: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    label: 'Medium Risk',
  },
  low: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
    label: 'Low Risk',
  },
};

// ---------------------------------------------------------------------------
// Diff renderer
// ---------------------------------------------------------------------------

function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.split('\n');

  return (
    <pre className="text-[11px] leading-relaxed overflow-x-auto max-h-48 rounded border border-border bg-muted/30 p-2 font-mono">
      {lines.map((line, i) => {
        let lineClass = 'text-muted-foreground';
        if (line.startsWith('+')) {
          lineClass = 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20';
        } else if (line.startsWith('-')) {
          lineClass = 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20';
        }
        return (
          <div key={i} className={lineClass}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ApprovalCardProps {
  approvalId: string;
  workspaceId: string;
  requestingAgent: string;
  targetAgent: string;
  action: string;
  details?: Record<string, unknown>;
  status: 'pending' | 'granted' | 'rejected' | 'expired' | 'escalated';
  createdAt: string;
  timeoutMs: number;
  onResolved?: (status: 'granted' | 'rejected') => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalCard({
  approvalId,
  workspaceId,
  requestingAgent,
  targetAgent,
  action,
  details,
  status,
  createdAt,
  timeoutMs,
  onResolved,
}: ApprovalCardProps) {
  const approveMutation = useApproveAction();
  const rejectMutation = useRejectAction();
  const escalateMutation = useEscalateAction();
  const [remainingMs, setRemainingMs] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isApproving = approveMutation.isPending;
  const isRejecting = rejectMutation.isPending;
  const isEscalating = escalateMutation.isPending;
  const isBusy = isApproving || isRejecting || isEscalating;

  const risk = useMemo(() => classifyRisk(action, details), [action, details]);
  const riskStyle = RISK_STYLES[risk];

  const isPendingOrEscalated = status === 'pending' || status === 'escalated';

  // Determine whether the preview section has anything to show
  const hasPreview = Boolean(
    details && (details.diff || details.files || details.command),
  );

  // Countdown timer
  useEffect(() => {
    if (!isPendingOrEscalated) return;

    const update = () => {
      const elapsed = Date.now() - new Date(createdAt).getTime();
      setRemainingMs(Math.max(0, timeoutMs - elapsed));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [status, createdAt, timeoutMs, isPendingOrEscalated]);

  const handleApprove = () => {
    approveMutation.mutate(
      { approvalId, workspaceId },
      { onSuccess: () => onResolved?.('granted') },
    );
  };

  const handleReject = () => {
    rejectMutation.mutate(
      { approvalId, workspaceId },
      { onSuccess: () => onResolved?.('rejected') },
    );
  };

  const handleEscalate = () => {
    escalateMutation.mutate({ approvalId, workspaceId });
  };

  const remainingSec = Math.ceil(remainingMs / 1000);
  const remainingMin = Math.floor(remainingSec / 60);
  const remainingSecPart = remainingSec % 60;

  return (
    <div
      className={cn(
        'mx-4 my-1 p-3 rounded-lg border',
        status === 'pending' && 'border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/10',
        status === 'escalated' && 'border-orange-300 bg-orange-50/50 dark:border-orange-700 dark:bg-orange-950/10',
        status === 'granted' && 'border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-950/10',
        status === 'rejected' && 'border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-950/10',
        status === 'expired' && 'border-gray-300 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-950/10 opacity-60',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="text-sm font-medium">Approval Required</span>

        {/* Risk badge */}
        <span
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
            riskStyle.bg,
            riskStyle.text,
          )}
        >
          {riskStyle.label}
        </span>

        {isPendingOrEscalated && remainingMs > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
            <Clock className="h-3 w-3" />
            {remainingMin}:{remainingSecPart.toString().padStart(2, '0')}
          </span>
        )}
        {!isPendingOrEscalated && (
          <span className={cn(
            'text-[10px] font-medium ml-auto uppercase',
            status === 'granted' && 'text-green-600',
            status === 'rejected' && 'text-red-600',
            status === 'expired' && 'text-gray-500',
          )}>
            {status}
          </span>
        )}
      </div>

      {/* Details */}
      <p className="text-xs text-muted-foreground mb-2">
        <span className="font-medium">{requestingAgent}</span> wants to{' '}
        <span className="font-medium">{action}</span> to{' '}
        <span className="font-medium">@{targetAgent}</span>
      </p>

      {details?.prompt && (
        <p className="text-xs bg-muted/50 rounded px-2 py-1 mb-2 truncate">
          {String(details.prompt)}
        </p>
      )}

      {status === 'escalated' && (
        <p className="text-[11px] text-orange-600 dark:text-orange-400 font-medium mb-2">
          Escalated -- timeout extended for human review
        </p>
      )}

      {/* Action preview panel */}
      {hasPreview && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(!previewOpen)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {previewOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {previewOpen ? 'Hide details' : 'Show details'}
          </button>

          {previewOpen && (
            <div className="mt-1.5 space-y-2">
              {/* Diff */}
              {typeof details?.diff === 'string' && details.diff.length > 0 && (
                <DiffBlock diff={details.diff} />
              )}

              {/* Affected files list */}
              {Array.isArray(details?.files) && (details.files as string[]).length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Affected files
                  </span>
                  <ul className="mt-0.5 text-[11px] text-muted-foreground list-disc list-inside">
                    {(details.files as string[]).map((file, i) => (
                      <li key={i} className="truncate font-mono">
                        {file}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Command */}
              {typeof details?.command === 'string' && details.command.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Command
                  </span>
                  <pre className="mt-0.5 text-[11px] rounded border border-border bg-muted/30 p-2 font-mono overflow-x-auto">
                    {details.command}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {isPendingOrEscalated && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleApprove}
            disabled={isBusy}
            className="h-7 text-xs"
          >
            {isApproving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleReject}
            disabled={isBusy}
            className="h-7 text-xs"
          >
            {isRejecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldX className="h-3 w-3 mr-1" />}
            Reject
          </Button>
          {status !== 'escalated' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleEscalate}
              disabled={isBusy}
              className="h-7 text-xs border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/20"
            >
              {isEscalating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldAlert className="h-3 w-3 mr-1" />}
              Escalate
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
