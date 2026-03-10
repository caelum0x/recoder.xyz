'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Star, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useUpsertRating, useThreadRatings } from '@/hooks/threads/use-response-ratings';
import { toast } from '@/lib/toast';

const QUICK_TAGS = [
  'Helpful',
  'Accurate',
  'Creative',
  'Too long',
  'Too short',
  'Incorrect',
  'Off topic',
  'Great code',
];

interface ResponseRatingProps {
  threadId: string;
  messageId: string;
  agentId?: string;
  className?: string;
}

export function ResponseRating({
  threadId,
  messageId,
  agentId,
  className,
}: ResponseRatingProps) {
  const { data: threadRatings } = useThreadRatings(threadId);
  const upsertMutation = useUpsertRating();

  const existingRating = useMemo(() => {
    if (!threadRatings?.ratings) return null;
    return threadRatings.ratings.find((r) => r.message_id === messageId) || null;
  }, [threadRatings, messageId]);

  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedRating, setSelectedRating] = useState(existingRating?.rating || 0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState(existingRating?.feedback || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(existingRating?.tags || []);
  const [isVisible, setIsVisible] = useState(false);

  // Sync with existing rating when data loads
  React.useEffect(() => {
    if (existingRating) {
      setSelectedRating(existingRating.rating);
      setFeedback(existingRating.feedback || '');
      setSelectedTags(existingRating.tags || []);
    }
  }, [existingRating]);

  const handleRate = useCallback(
    async (rating: number) => {
      setSelectedRating(rating);
      try {
        await upsertMutation.mutateAsync({
          thread_id: threadId,
          message_id: messageId,
          agent_id: agentId,
          rating,
          feedback: feedback || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
        });
      } catch (err: any) {
        toast.error('Failed to save rating');
      }
    },
    [threadId, messageId, agentId, feedback, selectedTags, upsertMutation],
  );

  const handleSubmitFeedback = useCallback(async () => {
    if (!selectedRating) return;
    try {
      await upsertMutation.mutateAsync({
        thread_id: threadId,
        message_id: messageId,
        agent_id: agentId,
        rating: selectedRating,
        feedback: feedback || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
      setShowFeedback(false);
      toast.success('Feedback saved');
    } catch (err: any) {
      toast.error('Failed to save feedback');
    }
  }, [threadId, messageId, agentId, selectedRating, feedback, selectedTags, upsertMutation]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const displayRating = hoveredStar || selectedRating;

  return (
    <div
      className={cn('group/rating inline-flex items-center', className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => {
        if (!showFeedback && !selectedRating) setIsVisible(false);
      }}
    >
      {/* Star Rating */}
      <div
        className={cn(
          'flex items-center gap-0.5 transition-opacity duration-150',
          isVisible || selectedRating ? 'opacity-100' : 'opacity-0',
        )}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            className="p-0 focus:outline-none transition-transform hover:scale-110"
            onMouseEnter={() => setHoveredStar(star)}
            onMouseLeave={() => setHoveredStar(0)}
            onClick={() => handleRate(star)}
            aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5 transition-colors',
                star <= displayRating
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-muted-foreground/40',
              )}
            />
          </button>
        ))}

        {/* Feedback toggle */}
        {(selectedRating > 0 || isVisible) && (
          <button
            className={cn(
              'ml-1 p-0.5 rounded transition-colors',
              showFeedback
                ? 'text-primary'
                : 'text-muted-foreground/50 hover:text-muted-foreground',
            )}
            onClick={() => setShowFeedback(!showFeedback)}
            title="Add feedback"
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Feedback Panel */}
      {showFeedback && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg p-3 w-72">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground">Feedback</span>
            <button
              onClick={() => setShowFeedback(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick Tags */}
          <div className="flex flex-wrap gap-1 mb-2">
            {QUICK_TAGS.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                className="cursor-pointer text-[10px] py-0 px-1.5 h-5"
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>

          {/* Text Feedback */}
          <Textarea
            placeholder="Optional details..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            className="text-xs resize-none mb-2"
          />

          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleSubmitFeedback}
            disabled={!selectedRating || upsertMutation.isPending}
          >
            {upsertMutation.isPending ? 'Saving...' : 'Submit'}
          </Button>
        </div>
      )}
    </div>
  );
}
