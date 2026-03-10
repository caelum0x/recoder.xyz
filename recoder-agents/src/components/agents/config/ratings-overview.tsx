'use client';

import React from 'react';
import { Star, MessageSquare, Tag, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { useRatingsSummary } from '@/hooks/threads/use-response-ratings';
import { format } from 'date-fns';

interface RatingsOverviewProps {
  agentId: string;
}

function StarDisplay({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const iconSize = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            iconSize,
            star <= Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/30',
          )}
        />
      ))}
    </div>
  );
}

function DistributionBar({ label, count, total }: { label: string; count: number; total: number }) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-muted-foreground text-right">{label}</span>
      <Star className="h-3 w-3 text-amber-400 fill-amber-400 flex-shrink-0" />
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-8 text-right text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
}

export function RatingsOverview({ agentId }: RatingsOverviewProps) {
  const { data: summary, isLoading, isError } = useRatingsSummary(agentId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">Failed to load ratings summary.</p>
    );
  }

  if (!summary || summary.total_ratings === 0) {
    return (
      <SpotlightCard className="p-8 text-center">
        <Star className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-base font-medium mb-1">No ratings yet</h3>
        <p className="text-sm text-muted-foreground">
          Ratings will appear here once users rate responses from this agent.
        </p>
      </SpotlightCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Ratings Overview</h2>
        <Badge variant="secondary" className="text-xs">
          {summary.total_ratings} rating{summary.total_ratings !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Average Rating */}
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Average Rating</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold tabular-nums">
              {summary.average_rating.toFixed(1)}
            </span>
            <StarDisplay rating={summary.average_rating} size="lg" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Based on {summary.total_ratings} rating{summary.total_ratings !== 1 ? 's' : ''}
          </p>
        </SpotlightCard>

        {/* Distribution */}
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Distribution</span>
          </div>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => (
              <DistributionBar
                key={star}
                label={String(star)}
                count={summary.distribution[String(star)] || 0}
                total={summary.total_ratings}
              />
            ))}
          </div>
        </SpotlightCard>

        {/* Top Tags */}
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Top Tags</span>
          </div>
          {summary.top_tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tags yet</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {summary.top_tags.map((tag) => (
                <Badge key={tag.tag} variant="secondary" className="text-xs">
                  {tag.tag}
                  <span className="ml-1 text-muted-foreground">{tag.count}</span>
                </Badge>
              ))}
            </div>
          )}
        </SpotlightCard>
      </div>

      {/* Recent Feedback */}
      {summary.recent_feedback.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Recent Feedback</span>
          </div>
          <div className="space-y-2">
            {summary.recent_feedback.map((item) => (
              <SpotlightCard key={item.id} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <StarDisplay rating={item.rating} />
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(item.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
                <p className="text-sm text-foreground">{item.feedback}</p>
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {item.tags.map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </SpotlightCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
