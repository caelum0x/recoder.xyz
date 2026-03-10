'use client';

import React, { useState, useMemo } from 'react';
import {
  History,
  ChevronDown,
  ChevronRight,
  FileText,
  Wrench,
  Brain,
  Zap,
  Server,
  BookOpen,
  Settings,
  Tag,
  Filter,
  BarChart3,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  useAgentChangelog,
  useChangelogSummary,
} from '@/hooks/agents/use-agent-changelog';
import {
  CHANGE_TYPE_LABELS,
  type ChangelogEntry,
} from '@/lib/api/agent-changelog';

interface ChangelogScreenProps {
  agentId: string;
}

const CHANGE_TYPE_ICONS: Record<string, React.ElementType> = {
  instructions_updated: Brain,
  tools_added: Wrench,
  tools_removed: Wrench,
  tools_configured: Wrench,
  model_changed: Settings,
  name_changed: Tag,
  knowledge_added: BookOpen,
  knowledge_removed: BookOpen,
  trigger_added: Zap,
  trigger_removed: Zap,
  integration_added: Server,
  integration_removed: Server,
  settings_changed: Settings,
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
  instructions_updated: 'text-blue-500',
  tools_added: 'text-green-500',
  tools_removed: 'text-red-500',
  tools_configured: 'text-amber-500',
  model_changed: 'text-purple-500',
  name_changed: 'text-cyan-500',
  knowledge_added: 'text-emerald-500',
  knowledge_removed: 'text-orange-500',
  trigger_added: 'text-yellow-500',
  trigger_removed: 'text-rose-500',
  integration_added: 'text-indigo-500',
  integration_removed: 'text-pink-500',
  settings_changed: 'text-slate-500',
};

function DiffView({ oldValue, newValue }: { oldValue: any; newValue: any }) {
  const oldStr = oldValue ? JSON.stringify(oldValue, null, 2) : '(empty)';
  const newStr = newValue ? JSON.stringify(newValue, null, 2) : '(empty)';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
        <p className="text-xs font-medium text-red-400 mb-1.5">Previous</p>
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-48 overflow-auto">
          {oldStr}
        </pre>
      </div>
      <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3">
        <p className="text-xs font-medium text-green-400 mb-1.5">Updated</p>
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-48 overflow-auto">
          {newStr}
        </pre>
      </div>
    </div>
  );
}

function ChangelogItem({ entry }: { entry: ChangelogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CHANGE_TYPE_ICONS[entry.change_type] || FileText;
  const colorClass = CHANGE_TYPE_COLORS[entry.change_type] || 'text-muted-foreground';
  const hasDiff = entry.old_value !== null || entry.new_value !== null;

  return (
    <div className="relative pl-8 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border last:hidden" />

      {/* Timeline dot */}
      <div
        className={cn(
          'absolute left-0 top-1 w-6 h-6 rounded-full border-2 border-background bg-muted flex items-center justify-center',
        )}
      >
        <Icon className={cn('h-3 w-3', colorClass)} />
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {CHANGE_TYPE_LABELS[entry.change_type] || entry.change_type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {format(parseISO(entry.created_at), 'MMM d, yyyy HH:mm')}
          </span>
        </div>

        {entry.description && (
          <p className="text-sm text-foreground">{entry.description}</p>
        )}

        {hasDiff && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 mr-1" />
            ) : (
              <ChevronRight className="h-3 w-3 mr-1" />
            )}
            {expanded ? 'Hide diff' : 'Show diff'}
          </Button>
        )}

        {expanded && hasDiff && (
          <DiffView oldValue={entry.old_value} newValue={entry.new_value} />
        )}
      </div>
    </div>
  );
}

function SummaryChart({ agentId }: { agentId: string }) {
  const { data: summary, isLoading } = useChangelogSummary(agentId, 30);

  if (isLoading) {
    return (
      <SpotlightCard className="p-4">
        <Skeleton className="h-32 w-full" />
      </SpotlightCard>
    );
  }

  if (!summary || summary.summary.length === 0) {
    return null;
  }

  const maxCount = Math.max(...summary.summary.map((s) => s.count));

  return (
    <SpotlightCard className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Changes last {summary.period_days} days</h3>
        <Badge variant="secondary" className="ml-auto text-xs">
          {summary.total_changes} total
        </Badge>
      </div>
      <div className="space-y-2">
        {summary.summary.map((item) => (
          <div key={item.change_type} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-36 truncate">
              {CHANGE_TYPE_LABELS[item.change_type] || item.change_type}
            </span>
            <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-sm transition-all"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground w-8 text-right">
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </SpotlightCard>
  );
}

export function ChangelogScreen({ agentId }: ChangelogScreenProps) {
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading, error } = useAgentChangelog(agentId, {
    changeType: selectedType,
    page,
    pageSize,
  });

  const changeTypes = useMemo(() => Object.keys(CHANGE_TYPE_LABELS), []);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="flex-1 overflow-y-auto pb-8">
      <div className="max-w-3xl mx-auto px-1">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <History className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Changelog</h2>
        </div>

        {/* Summary chart */}
        <SummaryChart agentId={agentId} />

        {/* Filter */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Button
            variant={selectedType === undefined ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setSelectedType(undefined);
              setPage(1);
            }}
          >
            All
          </Button>
          {changeTypes.map((type) => (
            <Button
              key={type}
              variant={selectedType === type ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setSelectedType(type);
                setPage(1);
              }}
            >
              {CHANGE_TYPE_LABELS[type]}
            </Button>
          ))}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <SpotlightCard className="p-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load changelog</p>
          </SpotlightCard>
        )}

        {/* Empty state */}
        {!isLoading && !error && data?.changes.length === 0 && (
          <SpotlightCard className="p-8 text-center">
            <History className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-sm font-medium mb-1">No changes recorded yet</h3>
            <p className="text-xs text-muted-foreground">
              Configuration changes will appear here as they are made.
            </p>
          </SpotlightCard>
        )}

        {/* Timeline */}
        {!isLoading && data && data.changes.length > 0 && (
          <div className="relative">
            {data.changes.map((entry) => (
              <ChangelogItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
