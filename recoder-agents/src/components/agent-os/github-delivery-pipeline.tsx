'use client';

import {
  CheckCircle2,
  CircleSlash,
  Clock,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  Loader2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type AgentOsGitHubDeliveryLink,
  type GitHubCheckSummary,
  type GitHubDeliveryLinkStatus,
  type GitHubReviewSummary,
} from '@/hooks/workspaces/use-mission-control';

const STATUS_STYLE: Record<
  GitHubDeliveryLinkStatus,
  { label: string; className: string }
> = {
  branch_mapped: {
    label: 'branch mapped',
    className: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  pr_open: {
    label: 'PR open',
    className: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  checks_pending: {
    label: 'checks pending',
    className:
      'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  checks_failed: {
    label: 'checks failed',
    className: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
  },
  review_required: {
    label: 'review required',
    className:
      'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  ready_for_approval: {
    label: 'ready for approval',
    className:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  merged: {
    label: 'merged',
    className:
      'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  closed: {
    label: 'closed',
    className:
      'border-muted-foreground/40 bg-muted text-muted-foreground',
  },
  blocked: {
    label: 'blocked',
    className: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
  },
};

function checkCounts(checks: GitHubCheckSummary[]) {
  return checks.reduce(
    (acc, check) => {
      if (check.state === 'success' || check.state === 'neutral') acc.passed += 1;
      else if (check.state === 'failure' || check.state === 'action_required')
        acc.failed += 1;
      else if (check.state === 'pending') acc.pending += 1;
      return acc;
    },
    { passed: 0, failed: 0, pending: 0 },
  );
}

function reviewCounts(reviews: GitHubReviewSummary[]) {
  return reviews.reduce(
    (acc, review) => {
      if (review.state === 'approved') acc.approved += 1;
      else if (review.state === 'changes_requested') acc.changesRequested += 1;
      return acc;
    },
    { approved: 0, changesRequested: 0 },
  );
}

function StatusIcon({ status }: { status: GitHubDeliveryLinkStatus }) {
  if (status === 'merged') return <GitMerge className="h-4 w-4" />;
  if (status === 'ready_for_approval')
    return <CheckCircle2 className="h-4 w-4" />;
  if (status === 'checks_failed' || status === 'blocked')
    return <XCircle className="h-4 w-4" />;
  if (status === 'checks_pending')
    return <Loader2 className="h-4 w-4 animate-spin" />;
  if (status === 'closed') return <CircleSlash className="h-4 w-4" />;
  if (status === 'review_required') return <Clock className="h-4 w-4" />;
  return <GitPullRequest className="h-4 w-4" />;
}

function DeliveryRow({
  link,
  onSelectRun,
}: {
  link: AgentOsGitHubDeliveryLink;
  onSelectRun?: (runId: string) => void;
}) {
  const style = STATUS_STYLE[link.status];
  const checks = checkCounts(link.checks);
  const reviews = reviewCounts(link.reviews);
  const prLabel = link.pullRequestNumber
    ? `PR #${link.pullRequestNumber}`
    : link.branch;

  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
              style.className,
            )}
          >
            <StatusIcon status={link.status} />
          </span>
          <div className="min-w-0">
            {link.pullRequestUrl ? (
              <a
                href={link.pullRequestUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 truncate text-sm font-medium underline-offset-4 hover:underline"
              >
                {prLabel}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="truncate text-sm font-medium">{prLabel}</span>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {link.repository}
              {link.baseBranch ? ` · ${link.branch} → ${link.baseBranch}` : ''}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn('shrink-0 rounded px-2 py-0.5 text-[11px]', style.className)}
        >
          {style.label}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-[11px] text-muted-foreground">
        <span>
          checks: {checks.passed}✓
          {checks.failed > 0 ? ` ${checks.failed}✗` : ''}
          {checks.pending > 0 ? ` ${checks.pending}…` : ''}
          {link.checks.length === 0 ? ' none' : ''}
        </span>
        <span>
          reviews: {reviews.approved} approved
          {reviews.changesRequested > 0
            ? ` · ${reviews.changesRequested} changes`
            : ''}
        </span>
        {link.previewArtifactIds.length > 0 ? (
          <span>{link.previewArtifactIds.length} preview</span>
        ) : null}
        {link.issueUrl ? (
          <a
            href={link.issueUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            issue
            {link.issueNumber ? ` #${link.issueNumber}` : ''}
          </a>
        ) : null}
        {link.runId && onSelectRun ? (
          <button
            type="button"
            onClick={() => onSelectRun(link.runId as string)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            view run timeline
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface GitHubDeliveryPipelineProps {
  links: AgentOsGitHubDeliveryLink[] | undefined;
  taskIds: Set<string>;
  onSelectRun?: (runId: string) => void;
}

/**
 * Renders the GitHub delivery pipeline (branch → PR → checks → review →
 * ready_for_approval → merged) for the active workspace's tasks.
 */
export function GitHubDeliveryPipeline({
  links,
  taskIds,
  onSelectRun,
}: GitHubDeliveryPipelineProps) {
  const scoped = (links ?? [])
    .filter((link) => taskIds.size === 0 || taskIds.has(link.taskId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (scoped.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No GitHub delivery links yet. Connect a repo and open a PR from a task to
        track branch → PR → checks → review → approval here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {scoped.slice(0, 8).map((link) => (
        <DeliveryRow key={link.linkId} link={link} onSelectRun={onSelectRun} />
      ))}
    </div>
  );
}
