'use client';

import React, { useState } from 'react';
import {
  FileText,
  Lightbulb,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Trash2,
  Clock,
  MessageSquare,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  useRecentSummaries,
  useDeleteSummary,
  useSummaryStats,
} from '@/hooks/threads/use-thread-summaries';
import type { ThreadSummary } from '@/lib/api/thread-summaries';

function SummaryCard({ summary }: { summary: ThreadSummary }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const deleteMutation = useDeleteSummary();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(summary.id);
      toast.success('Summary deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete summary');
    } finally {
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">
                  {summary.thread_name || `Thread ${summary.thread_id.slice(0, 8)}...`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 pl-6">
                {summary.summary.slice(0, 200)}
                {summary.summary.length > 200 ? '...' : ''}
              </p>
              <div className="flex items-center gap-2 mt-2 pl-6">
                {summary.key_points.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Lightbulb className="h-2.5 w-2.5" />
                    {summary.key_points.length} key points
                  </Badge>
                )}
                {summary.action_items.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <CheckSquare className="h-2.5 w-2.5" />
                    {summary.action_items.length} actions
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] gap-1">
                  <MessageSquare className="h-2.5 w-2.5" />
                  {summary.message_count}
                </Badge>
                <span className="text-[10px] text-muted-foreground/60">
                  {format(new Date(summary.created_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}
                title="Delete summary"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            {/* Full Summary */}
            <div>
              <p className="text-sm text-foreground leading-relaxed">
                {summary.summary}
              </p>
            </div>

            {/* Key Points */}
            {summary.key_points.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Key Points
                </h4>
                <ul className="space-y-1.5">
                  {summary.key_points.map((point, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 flex-shrink-0 h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="text-sm text-foreground/90">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {summary.action_items.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CheckSquare className="h-3.5 w-3.5" />
                  Action Items
                </h4>
                <ul className="space-y-1.5">
                  {summary.action_items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <div className="mt-0.5 flex-shrink-0 h-4 w-4 rounded border border-muted-foreground/30" />
                      <span className="text-sm text-foreground/90">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-3 pt-2 border-t text-[10px] text-muted-foreground/60">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Generated {format(new Date(summary.created_at), 'MMM d, yyyy HH:mm')}
              </span>
              <span>{summary.word_count} words</span>
              <span>{summary.summary_type}</span>
            </div>
          </CardContent>
        )}
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Summary</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this thread summary? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function SummariesPage() {
  const { data: summaries, isLoading } = useRecentSummaries(50);
  const { data: stats, isLoading: statsLoading } = useSummaryStats();

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 max-w-4xl mx-auto w-full">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Thread Summaries</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          AI-generated summaries of your conversation threads.
        </p>
      </div>

      {/* Stats Header */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Summaries</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-12 mt-0.5" />
              ) : (
                <p className="text-lg font-semibold">{stats?.total_summaries ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Lightbulb className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Key Points</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-12 mt-0.5" />
              ) : (
                <p className="text-lg font-semibold">{stats?.avg_key_points ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckSquare className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Actions</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-12 mt-0.5" />
              ) : (
                <p className="text-lg font-semibold">{stats?.avg_action_items ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summaries List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !summaries || summaries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No summaries yet</p>
            <p className="text-xs text-muted-foreground">
              Summaries will appear here when you generate them from your thread conversations.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {summaries.map((summary) => (
            <SummaryCard key={summary.id} summary={summary} />
          ))}
        </div>
      )}
    </div>
  );
}
