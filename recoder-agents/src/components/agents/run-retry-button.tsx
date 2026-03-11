'use client';

import { useState } from 'react';
import {
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  useRetryRun,
  useRetryAttempts,
} from '@/hooks/agents/use-agent-retry';
import type { RetryAttempt } from '@/lib/api/agent-retry';

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  },
  retrying: {
    label: 'Retrying',
    icon: Loader2,
    className: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  },
  succeeded: {
    label: 'Succeeded',
    icon: CheckCircle2,
    className: 'bg-green-500/10 text-green-700 border-green-500/20',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-red-500/10 text-red-700 border-red-500/20',
  },
  exhausted: {
    label: 'Exhausted',
    icon: AlertTriangle,
    className: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn('text-xs gap-1', config.className)}>
      <Icon className={cn('h-3 w-3', status === 'retrying' && 'animate-spin')} />
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Attempt row
// ---------------------------------------------------------------------------

function AttemptRow({ attempt }: { attempt: RetryAttempt }) {
  const scheduledAt = attempt.scheduled_at
    ? new Date(attempt.scheduled_at).toLocaleString()
    : '-';
  const executedAt = attempt.executed_at
    ? new Date(attempt.executed_at).toLocaleString()
    : '-';

  return (
    <div className="flex items-start justify-between py-2 text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-xs text-muted-foreground">
            Attempt #{attempt.attempt_number}
          </span>
          <StatusBadge status={attempt.status} />
        </div>
        {attempt.error_type && (
          <p className="text-xs text-muted-foreground truncate">
            {attempt.error_type}
            {attempt.error_message ? `: ${attempt.error_message}` : ''}
          </p>
        )}
        <div className="flex gap-3 mt-0.5 text-[11px] text-muted-foreground">
          <span>Scheduled: {scheduledAt}</span>
          <span>Executed: {executedAt}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RunRetryButton
// ---------------------------------------------------------------------------

interface RunRetryButtonProps {
  runId: string;
  errorInfo?: string | null;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'icon';
  className?: string;
}

export function RunRetryButton({
  runId,
  errorInfo,
  variant = 'outline',
  size = 'sm',
  className,
}: RunRetryButtonProps) {
  const [open, setOpen] = useState(false);
  const [overrideInput, setOverrideInput] = useState('');

  const retryMutation = useRetryRun();
  const { data: attempts = [], isLoading: attemptsLoading } =
    useRetryAttempts(runId);

  const handleRetry = () => {
    retryMutation.mutate(
      {
        runId,
        data: overrideInput.trim()
          ? { override_input: overrideInput.trim() }
          : undefined,
      },
      {
        onSuccess: () => {
          setOverrideInput('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Retry
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Retry Run</DialogTitle>
          <DialogDescription>
            Retry the failed agent run. You can optionally override the input.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Error info */}
          {errorInfo && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive mb-1">
                Error from last run:
              </p>
              <p className="text-xs text-muted-foreground break-all">
                {errorInfo}
              </p>
            </div>
          )}

          {/* Override input */}
          <div className="space-y-2">
            <Label htmlFor="override-input">
              Override Input (optional)
            </Label>
            <Input
              id="override-input"
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              placeholder="Leave empty to use original input"
            />
          </div>

          {/* Previous attempts */}
          {attempts.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">
                  Previous Attempts ({attempts.length})
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-border">
                  {attempts.map((attempt) => (
                    <AttemptRow key={attempt.id} attempt={attempt} />
                  ))}
                </div>
              </div>
            </>
          )}

          {attemptsLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleRetry}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-1" />
                Retry Now
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
