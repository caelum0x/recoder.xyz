'use client';

import React, { useState } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckSquare,
  Lightbulb,
  Clock,
  MessageSquare,
  Type,
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
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  useThreadSummary,
  useSummarizeThread,
} from '@/hooks/threads/use-thread-summaries';

interface ThreadSummaryPanelProps {
  threadId: string;
  className?: string;
}

export function ThreadSummaryPanel({ threadId, className }: ThreadSummaryPanelProps) {
  const { data: summary, isLoading } = useThreadSummary(threadId);
  const summarizeMutation = useSummarizeThread();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleRegenerate = async () => {
    try {
      await summarizeMutation.mutateAsync({ threadId, summaryType: 'auto' });
      toast.success('Summary regenerated');
      setIsExpanded(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate summary');
    }
  };

  if (isLoading) {
    return (
      <Card className={cn('border-dashed', className)}>
        <CardHeader className="py-3 px-4">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
      </Card>
    );
  }

  // No summary yet - show generate button
  if (!summary) {
    return (
      <Card className={cn('border-dashed', className)}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span className="text-sm">No summary available</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={summarizeMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', summarizeMutation.isPending && 'animate-spin')} />
              {summarizeMutation.isPending ? 'Generating...' : 'Generate Summary'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('', className)}>
      {/* Collapsed header - always visible */}
      <CardHeader
        className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Thread Summary</CardTitle>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] gap-1">
                <MessageSquare className="h-2.5 w-2.5" />
                {summary.message_count}
              </Badge>
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Type className="h-2.5 w-2.5" />
                {summary.word_count} words
              </Badge>
              {summary.key_points.length > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Lightbulb className="h-2.5 w-2.5" />
                  {summary.key_points.length}
                </Badge>
              )}
              {summary.action_items.length > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <CheckSquare className="h-2.5 w-2.5" />
                  {summary.action_items.length}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleRegenerate();
              }}
              disabled={summarizeMutation.isPending}
              title="Regenerate summary"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', summarizeMutation.isPending && 'animate-spin')} />
            </Button>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {/* Expanded content */}
      {isExpanded && (
        <CardContent className="px-4 pb-4 pt-0 space-y-4">
          {/* Summary text */}
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
                    <span className="text-primary mt-1.5 flex-shrink-0 h-1.5 w-1.5 rounded-full bg-primary" />
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

          {/* Footer with metadata */}
          <div className="flex items-center gap-3 pt-2 border-t text-[10px] text-muted-foreground/60">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Generated {format(new Date(summary.created_at), 'MMM d, yyyy HH:mm')}
            </span>
            <span>{summary.summary_type}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
