'use client';

import {
  Brain,
  CircleDot,
  Clock,
  ExternalLink,
  FileText,
  GitBranch,
  GitPullRequest,
  Globe,
  Lock,
  Scale,
  ShieldCheck,
  TerminalSquare,
  Workflow,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useAgentOsRunHistory,
  type AgentOsRunHistoryItem,
  type AgentOsRunHistoryItemKind,
  type AgentOsRunHistoryItemSeverity,
} from '@/hooks/workspaces/use-mission-control';

const KIND_ICON: Record<AgentOsRunHistoryItemKind, typeof Workflow> = {
  run_state: Workflow,
  run_event: CircleDot,
  artifact: FileText,
  runtime_evidence: TerminalSquare,
  approval: ShieldCheck,
  policy_decision: Scale,
  memory_candidate: Brain,
  memory_item: Brain,
  instruction_bundle: FileText,
  github_delivery_link: GitPullRequest,
  work_lock: Lock,
};

const KIND_LABEL: Record<AgentOsRunHistoryItemKind, string> = {
  run_state: 'Run state',
  run_event: 'Event',
  artifact: 'Artifact',
  runtime_evidence: 'Runtime evidence',
  approval: 'Approval',
  policy_decision: 'Policy',
  memory_candidate: 'Memory candidate',
  memory_item: 'Memory accepted',
  instruction_bundle: 'Instruction bundle',
  github_delivery_link: 'GitHub delivery',
  work_lock: 'Work lock',
};

const SEVERITY_DOT: Record<AgentOsRunHistoryItemSeverity, string> = {
  info: 'border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  success:
    'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning:
    'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  block: 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400',
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Surfaces an http(s) link from a history item's refs so the operator can jump
 * straight to the PR, preview, or issue tied to that timeline step.
 */
function primaryLink(
  item: AgentOsRunHistoryItem,
): { href: string; label: string } | null {
  const refs = item.refs ?? {};
  const ordered: Array<[string, string]> = [
    ['pullRequestUrl', 'Open PR'],
    ['previewUrl', 'Open preview'],
    ['url', 'Open'],
    ['issueUrl', 'Open issue'],
  ];
  for (const [key, label] of ordered) {
    const value = refs[key];
    if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      return { href: value, label };
    }
  }
  return null;
}

function TimelineRow({
  item,
  isLast,
}: {
  item: AgentOsRunHistoryItem;
  isLast: boolean;
}) {
  const Icon = KIND_ICON[item.kind] ?? CircleDot;
  const link = primaryLink(item);
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border"
        />
      )}
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
          SEVERITY_DOT[item.severity],
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{item.title}</span>
          <Badge
            variant="outline"
            className="shrink-0 rounded px-2 py-0.5 text-[11px]"
          >
            {KIND_LABEL[item.kind] ?? item.kind}
          </Badge>
        </div>
        {item.summary ? (
          <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
            {item.summary}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTimestamp(item.createdAt)}
          </span>
          {item.refs?.branch ? (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {item.refs.branch}
            </span>
          ) : null}
          {link ? (
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {link.label}
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export interface RunTimelineProps {
  runId: string | null;
  runTitle?: string;
}

/**
 * Renders the full task -> artifact -> PR -> preview -> approval timeline for a
 * single run, read from shared Agent OS run history.
 */
export function RunTimeline({ runId, runTitle }: RunTimelineProps) {
  const { data, isLoading, isError, error } = useAgentOsRunHistory(runId);

  if (!runId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a run to view its task → artifact → PR → preview → approval
        timeline.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        {error instanceof Error
          ? error.message
          : 'No run history available for this run yet.'}
      </p>
    );
  }

  if (data.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No history items recorded for this run yet.
      </p>
    );
  }

  const { counts, latest } = data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {runTitle || data.task?.prompt || data.run.taskId}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            run {data.run.runId} · {data.run.state.replace(/_/g, ' ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
            <GitPullRequest className="h-3 w-3" />
            {latest.pullRequestArtifactIds.length} PR
          </span>
          <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
            <Globe className="h-3 w-3" />
            {latest.previewArtifactIds.length} preview
          </span>
          <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
            <TerminalSquare className="h-3 w-3" />
            {counts.runtimeEvidence} evidence
          </span>
          <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
            <ShieldCheck className="h-3 w-3" />
            {counts.approvals} approvals
          </span>
        </div>
      </div>
      <ScrollArea className="max-h-[28rem] pr-3">
        <ol className="relative">
          {data.items.map((item, index) => (
            <TimelineRow
              key={item.itemId}
              item={item}
              isLast={index === data.items.length - 1}
            />
          ))}
        </ol>
      </ScrollArea>
    </div>
  );
}
