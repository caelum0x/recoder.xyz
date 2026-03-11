'use client';

import React, { useState } from 'react';
import {
  GitMerge,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Undo2,
  Clock,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  usePreviewMerge,
  useMergeThreads,
  useMergeHistory,
  useRevertMerge,
  type MergePreviewResponse,
  type ThreadMerge,
} from '@/hooks/threads/use-thread-merge';
import type { MergeStrategy } from '@/lib/api/thread-merge';
import { toast } from '@/lib/toast';

// ---- Strategy descriptions ----

const STRATEGY_INFO: Record<MergeStrategy, { label: string; description: string }> = {
  append: {
    label: 'Append',
    description: 'Add source messages after target messages in order.',
  },
  interleave: {
    label: 'Interleave',
    description: 'Merge messages by timestamp, interleaving both threads.',
  },
  summarize: {
    label: 'Summarize',
    description: 'Condense source messages into a summary before merging.',
  },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  reverted: 'bg-muted text-muted-foreground',
};

// ---- Preview Results Panel ----

function PreviewResults({ preview }: { preview: MergePreviewResponse }) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h4 className="text-sm font-medium">Preview Results</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">Source Messages</span>
          <p className="font-medium">{preview.source_message_count}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">Target Messages</span>
          <p className="font-medium">{preview.target_message_count}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">Estimated Merged</span>
          <p className="font-medium">{preview.estimated_merged_count}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">Est. Conflicts</span>
          <p className="font-medium flex items-center gap-1">
            {preview.estimated_conflicts}
            {preview.estimated_conflicts > 0 && (
              <AlertTriangle className="h-3 w-3 text-yellow-500" />
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- Merge History Panel ----

function MergeHistoryPanel() {
  const { data: history, isLoading } = useMergeHistory();
  const revertMerge = useRevertMerge();

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No merge history yet
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {history.map((merge: ThreadMerge) => (
        <div
          key={merge.merge_id}
          className="flex items-center justify-between rounded-lg border p-3 text-sm"
        >
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs truncate">
                {merge.source_thread_id.slice(0, 8)}...
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="font-mono text-xs truncate">
                {merge.target_thread_id.slice(0, 8)}...
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {merge.merged_message_count} messages
              <Badge variant="outline" className="text-xs py-0">
                {merge.merge_strategy}
              </Badge>
              <Badge className={STATUS_COLORS[merge.status] || ''}>
                {merge.status}
              </Badge>
            </div>
          </div>
          {merge.status === 'completed' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => revertMerge.mutate(merge.merge_id)}
              disabled={revertMerge.isPending}
              className="ml-2 flex-shrink-0"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Main Dialog ----

interface ThreadMergeDialogProps {
  trigger?: React.ReactNode;
  defaultSourceId?: string;
  defaultTargetId?: string;
}

export function ThreadMergeDialog({
  trigger,
  defaultSourceId = '',
  defaultTargetId = '',
}: ThreadMergeDialogProps) {
  const [open, setOpen] = useState(false);
  const [sourceThreadId, setSourceThreadId] = useState(defaultSourceId);
  const [targetThreadId, setTargetThreadId] = useState(defaultTargetId);
  const [strategy, setStrategy] = useState<MergeStrategy>('append');
  const [showHistory, setShowHistory] = useState(false);

  const previewMerge = usePreviewMerge();
  const mergeThreads = useMergeThreads();

  const preview = previewMerge.data;
  const canPreview = sourceThreadId.trim() && targetThreadId.trim() && sourceThreadId !== targetThreadId;
  const canMerge = canPreview && preview;

  const handlePreview = () => {
    if (!canPreview) {
      toast.error('Please enter two different thread IDs');
      return;
    }
    previewMerge.mutate({
      source_thread_id: sourceThreadId.trim(),
      target_thread_id: targetThreadId.trim(),
      merge_strategy: strategy,
    });
  };

  const handleMerge = async () => {
    if (!canMerge) return;
    try {
      await mergeThreads.mutateAsync({
        source_thread_id: sourceThreadId.trim(),
        target_thread_id: targetThreadId.trim(),
        merge_strategy: strategy,
      });
      setOpen(false);
      setSourceThreadId('');
      setTargetThreadId('');
      previewMerge.reset();
    } catch {
      // Error toast is handled in the hook
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      previewMerge.reset();
      setShowHistory(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <GitMerge className="mr-2 h-4 w-4" />
            Merge Threads
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge Threads
          </DialogTitle>
          <DialogDescription>
            Combine messages from two threads into one. Source messages will be moved to the target thread.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source Thread */}
          <div className="space-y-2">
            <Label htmlFor="source-thread">Source Thread ID</Label>
            <Input
              id="source-thread"
              placeholder="Enter source thread ID"
              value={sourceThreadId}
              onChange={(e) => setSourceThreadId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Messages from this thread will be moved
            </p>
          </div>

          {/* Target Thread */}
          <div className="space-y-2">
            <Label htmlFor="target-thread">Target Thread ID</Label>
            <Input
              id="target-thread"
              placeholder="Enter target thread ID"
              value={targetThreadId}
              onChange={(e) => setTargetThreadId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Messages will be merged into this thread
            </p>
          </div>

          {/* Strategy Picker */}
          <div className="space-y-2">
            <Label>Merge Strategy</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as MergeStrategy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STRATEGY_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    {info.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {STRATEGY_INFO[strategy].description}
            </p>
          </div>

          {/* Same thread warning */}
          {sourceThreadId && targetThreadId && sourceThreadId === targetThreadId && (
            <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              Source and target must be different threads
            </div>
          )}

          {/* Preview button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={handlePreview}
            disabled={!canPreview || previewMerge.isPending}
          >
            {previewMerge.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Previewing...
              </>
            ) : (
              'Preview Merge'
            )}
          </Button>

          {/* Preview Results */}
          {preview && <PreviewResults preview={preview} />}

          {/* History toggle */}
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            onClick={() => setShowHistory(!showHistory)}
          >
            <Clock className="h-3 w-3" />
            {showHistory ? 'Hide' : 'Show'} Merge History
          </button>

          {showHistory && <MergeHistoryPanel />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!canMerge || mergeThreads.isPending}
          >
            {mergeThreads.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="mr-2 h-4 w-4" />
                Merge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
