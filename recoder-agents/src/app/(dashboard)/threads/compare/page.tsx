'use client';

import React, { useState } from 'react';
import {
  Trophy,
  Star,
  Trash2,
  Plus,
  GitCompare,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  XCircle,
  BarChart3,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  useThreadComparisons,
  useComparisonDetail,
  useCreateComparison,
  useDeleteComparison,
  useSubmitEvaluation,
  useComparisonStats,
} from '@/hooks/threads/use-thread-comparisons';
import type {
  ThreadComparison,
  ComparisonEvaluation,
  ThreadComparisonDetail,
} from '@/lib/api/thread-comparisons';

// ── Star Rating ────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readonly = false,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  readonly?: boolean;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          className={cn(
            'transition-colors',
            readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
          )}
          onClick={() => !readonly && onChange?.(n)}
          onMouseEnter={() => !readonly && setHover(n)}
          onMouseLeave={() => !readonly && setHover(0)}
        >
          <Star
            className={cn(
              'h-4 w-4',
              (hover || value || 0) >= n
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/30'
            )}
          />
        </button>
      ))}
      {value !== null && (
        <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
          {value}/10
        </span>
      )}
    </div>
  );
}

// ── New Comparison Dialog ──────────────────────────────────────────────────

function NewComparisonDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [threadIdsInput, setThreadIdsInput] = useState('');
  const [notes, setNotes] = useState('');

  const createComparison = useCreateComparison();

  const handleCreate = async () => {
    const threadIds = threadIdsInput
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (threadIds.length < 2) {
      toast.error('At least 2 thread IDs are required');
      return;
    }

    try {
      await createComparison.mutateAsync({
        thread_ids: threadIds,
        comparison_name: name.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success('Comparison created');
      setOpen(false);
      setName('');
      setThreadIdsInput('');
      setNotes('');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create comparison');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Comparison
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Thread Comparison</DialogTitle>
          <DialogDescription>
            Compare multiple threads side-by-side with quality evaluations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Comparison Name (optional)</Label>
            <Input
              placeholder="e.g. GPT-4 vs Claude 3.7"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Thread IDs (comma or newline separated)</Label>
            <Textarea
              placeholder="thread-abc123&#10;thread-def456&#10;thread-ghi789"
              value={threadIdsInput}
              onChange={(e) => setThreadIdsInput(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 2 thread IDs required.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Context for this comparison..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createComparison.isPending}>
            {createComparison.isPending ? 'Creating...' : 'Create Comparison'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Evaluation Form ────────────────────────────────────────────────────────

function EvaluationForm({
  comparisonId,
  threadId,
  existing,
  onClose,
}: {
  comparisonId: string;
  threadId: string;
  existing?: ComparisonEvaluation;
  onClose: () => void;
}) {
  const [score, setScore] = useState<number | null>(existing?.quality_score ?? null);
  const [preferred, setPreferred] = useState(existing?.preferred ?? false);
  const [strengthInput, setStrengthInput] = useState(
    (existing?.strengths ?? []).join('\n')
  );
  const [weaknessInput, setWeaknessInput] = useState(
    (existing?.weaknesses ?? []).join('\n')
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const submitEval = useSubmitEvaluation(comparisonId);

  const handleSubmit = async () => {
    const strengths = strengthInput
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const weaknesses = weaknessInput
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await submitEval.mutateAsync({
        thread_id: threadId,
        quality_score: score ?? undefined,
        strengths,
        weaknesses,
        preferred,
        notes: notes.trim() || undefined,
      });
      toast.success('Evaluation saved');
      onClose();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save evaluation');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Quality Score (1–10)</Label>
        <StarRating value={score} onChange={setScore} />
      </div>
      <div className="space-y-1.5">
        <Label>Strengths (one per line)</Label>
        <Textarea
          placeholder="Clear and concise&#10;Well structured&#10;..."
          value={strengthInput}
          onChange={(e) => setStrengthInput(e.target.value)}
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Weaknesses (one per line)</Label>
        <Textarea
          placeholder="Lacks detail&#10;Off-topic at times&#10;..."
          value={weaknessInput}
          onChange={(e) => setWeaknessInput(e.target.value)}
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          placeholder="Additional observations..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="cursor-pointer">Mark as Preferred</Label>
        <Switch checked={preferred} onCheckedChange={setPreferred} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitEval.isPending} className="flex-1">
          {submitEval.isPending ? 'Saving...' : 'Save Evaluation'}
        </Button>
      </div>
    </div>
  );
}

// ── Thread Column ──────────────────────────────────────────────────────────

function ThreadColumn({
  comparisonId,
  threadId,
  evaluation,
  isWinner,
}: {
  comparisonId: string;
  threadId: string;
  evaluation?: ComparisonEvaluation;
  isWinner: boolean;
}) {
  const [evalOpen, setEvalOpen] = useState(false);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 min-w-[260px]',
        isWinner
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-border bg-card'
      )}
    >
      {/* Thread header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isWinner && (
            <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <p className="font-mono text-xs font-medium truncate">{threadId}</p>
        </div>
        {evaluation?.preferred && (
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs shrink-0">
            Preferred
          </Badge>
        )}
      </div>

      {/* Quality Score */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Quality Score</p>
        <StarRating value={evaluation?.quality_score ?? null} readonly />
        {!evaluation?.quality_score && (
          <p className="text-xs text-muted-foreground mt-1">Not evaluated yet</p>
        )}
      </div>

      {/* Strengths */}
      {(evaluation?.strengths?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Strengths</p>
          <ul className="space-y-1">
            {evaluation!.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {(evaluation?.weaknesses?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Weaknesses</p>
          <ul className="space-y-1">
            {evaluation!.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notes */}
      {evaluation?.notes && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Notes</p>
          <p className="text-xs text-foreground/80">{evaluation.notes}</p>
        </div>
      )}

      {/* Evaluate button */}
      <Dialog open={evalOpen} onOpenChange={setEvalOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="mt-auto gap-1.5 text-xs">
            <Star className="h-3.5 w-3.5" />
            {evaluation ? 'Edit Evaluation' : 'Evaluate'}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Evaluate Thread</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {threadId}
            </DialogDescription>
          </DialogHeader>
          <EvaluationForm
            comparisonId={comparisonId}
            threadId={threadId}
            existing={evaluation}
            onClose={() => setEvalOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Comparison Detail View ─────────────────────────────────────────────────

function ComparisonDetailView({
  comparisonId,
  onBack,
}: {
  comparisonId: string;
  onBack: () => void;
}) {
  const { data: detail, isLoading } = useComparisonDetail(comparisonId);
  const deleteComparison = useDeleteComparison();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteComparison.mutateAsync(comparisonId);
      toast.success('Comparison deleted');
      onBack();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to delete comparison');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!detail) return null;

  // Determine winner: thread with highest avg quality score
  const evalsByThread = (detail.evaluations ?? []).reduce<
    Record<string, ComparisonEvaluation>
  >((acc, ev) => {
    acc[ev.thread_id] = ev;
    return acc;
  }, {});

  let winnerId: string | null = null;
  let highestScore = 0;
  for (const [tid, ev] of Object.entries(evalsByThread)) {
    if ((ev.quality_score ?? 0) > highestScore) {
      highestScore = ev.quality_score ?? 0;
      winnerId = tid;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-base font-semibold">
              {detail.comparison_name || 'Untitled Comparison'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {detail.thread_ids.length} threads •{' '}
              {formatDistanceToNow(parseISO(detail.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Comparison</DialogTitle>
              <DialogDescription>
                This will permanently delete the comparison and all its evaluations.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteComparison.isPending}
              >
                {deleteComparison.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {detail.notes && (
        <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          {detail.notes}
        </p>
      )}

      {/* Side-by-side columns */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {detail.thread_ids.map((tid) => (
          <ThreadColumn
            key={tid}
            comparisonId={comparisonId}
            threadId={tid}
            evaluation={evalsByThread[tid]}
            isWinner={tid === winnerId && highestScore > 0}
          />
        ))}
      </div>

      {winnerId && highestScore > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5">
          <Trophy className="h-4 w-4 shrink-0" />
          <span>
            <strong>Winner:</strong>{' '}
            <span className="font-mono">{winnerId}</span> with a quality score of{' '}
            <strong>{highestScore}/10</strong>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Comparison List Item ───────────────────────────────────────────────────

function ComparisonListItem({
  comparison,
  onView,
}: {
  comparison: ThreadComparison;
  onView: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={onView}
    >
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-medium text-sm truncate">
              {comparison.comparison_name || 'Untitled Comparison'}
            </p>
            <Badge variant="secondary" className="text-xs shrink-0">
              {comparison.thread_ids.length} threads
            </Badge>
            {(comparison.evaluation_count ?? 0) > 0 && (
              <Badge variant="outline" className="text-xs shrink-0">
                {comparison.evaluation_count} evals
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(parseISO(comparison.created_at), { addSuffix: true })}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ThreadComparePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useComparisonStats();
  const { data: comparisons, isLoading: listLoading } = useThreadComparisons();

  if (selectedId) {
    return (
      <div className="p-6">
        <ComparisonDetailView
          comparisonId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Thread Comparisons</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare threads side-by-side with quality scoring and winner determination.
          </p>
        </div>
        <NewComparisonDialog />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <GitCompare className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Comparisons</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-12 mt-0.5" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums">
                  {stats?.total_comparisons ?? 0}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Star className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Quality Score</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-16 mt-0.5" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums">
                  {stats?.avg_quality_score.toFixed(1) ?? '0.0'}
                  <span className="text-sm font-normal text-muted-foreground">/10</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
              <Trophy className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Most Compared Thread</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-24 mt-0.5" />
              ) : stats?.most_compared_thread ? (
                <p className="text-sm font-mono font-medium truncate max-w-[160px]">
                  {stats.most_compared_thread.slice(0, 16)}…
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">None yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparison List */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Comparisons
        </h2>
        {listLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : !comparisons?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <GitCompare className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No comparisons yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Create a comparison to evaluate threads side-by-side.
              </p>
              <NewComparisonDialog />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {comparisons.map((c) => (
              <ComparisonListItem
                key={c.id}
                comparison={c}
                onView={() => setSelectedId(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
