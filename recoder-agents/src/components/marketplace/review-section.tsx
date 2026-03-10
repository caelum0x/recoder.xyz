'use client';

import { useState } from 'react';
import {
  Star,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  MessageSquare,
} from 'lucide-react';
import {
  useListingReviewsEnhanced,
  useReviewSummary,
  useCreateReview,
  useDeleteReview,
  useMarkHelpful,
} from '@/hooks/marketplace/use-marketplace-reviews';
import type { ReviewSortOption } from '@/lib/api/marketplace-reviews';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Star Rating
// ---------------------------------------------------------------------------

function StarRating({
  rating,
  interactive = false,
  onRate,
  size = 'sm',
}: {
  rating: number;
  interactive?: boolean;
  onRate?: (r: number) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [hovered, setHovered] = useState(0);
  const sizeClass =
    size === 'lg' ? 'h-6 w-6' : size === 'md' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = interactive
          ? star <= (hovered || rating)
          : star <= Math.round(rating);
        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            className={cn(
              'transition-colors',
              interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default',
            )}
            onMouseEnter={() => interactive && setHovered(star)}
            onMouseLeave={() => interactive && setHovered(0)}
            onClick={() => interactive && onRate?.(star)}
          >
            <Star
              className={cn(
                sizeClass,
                filled
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'fill-transparent text-muted-foreground/40',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution bar
// ---------------------------------------------------------------------------

function DistributionBar({
  star,
  count,
  total,
}: {
  star: number;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-4 text-right text-muted-foreground">{star}</span>
      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-yellow-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-muted-foreground text-right">{count}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

const SORT_OPTIONS: { value: ReviewSortOption; label: string }[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'highest', label: 'Highest Rated' },
  { value: 'lowest', label: 'Lowest Rated' },
  { value: 'helpful', label: 'Most Helpful' },
];

// ---------------------------------------------------------------------------
// Review Section Component
// ---------------------------------------------------------------------------

interface ReviewSectionProps {
  listingId: string;
  currentUserId?: string;
}

export function ReviewSection({ listingId, currentUserId }: ReviewSectionProps) {
  const [sort, setSort] = useState<ReviewSortOption>('recent');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useReviewSummary(listingId);
  const { data: reviewsData, isLoading: reviewsLoading } =
    useListingReviewsEnhanced(listingId, sort);
  const createMutation = useCreateReview();
  const deleteMutation = useDeleteReview();
  const helpfulMutation = useMarkHelpful();

  const reviews = reviewsData?.reviews ?? [];

  const handleSubmitReview = async () => {
    if (reviewRating === 0) {
      toast.error('Please select a rating.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        listingId,
        body: {
          rating: reviewRating,
          title: reviewTitle || undefined,
          body: reviewBody || undefined,
        },
      });
      toast.success('Review submitted!');
      setReviewRating(0);
      setReviewTitle('');
      setReviewBody('');
      setShowForm(false);
    } catch {
      toast.error('Failed to submit review.');
    }
  };

  const handleDelete = async (reviewId: string) => {
    try {
      await deleteMutation.mutateAsync({ reviewId, listingId });
      toast.success('Review deleted.');
    } catch {
      toast.error('Failed to delete review.');
    }
  };

  const handleHelpful = async (reviewId: string, isHelpful: boolean) => {
    try {
      await helpfulMutation.mutateAsync({ reviewId, isHelpful, listingId });
    } catch {
      toast.error('Failed to vote.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      <div className="rounded-xl border border-border bg-card p-5">
        {summaryLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-8 w-24 bg-muted rounded" />
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((s) => (
                <div key={s} className="h-3 w-full bg-muted rounded" />
              ))}
            </div>
          </div>
        ) : summary ? (
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Average */}
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-4xl font-bold text-foreground">
                {summary.average_rating > 0
                  ? summary.average_rating.toFixed(1)
                  : '--'}
              </span>
              <StarRating rating={summary.average_rating} size="md" />
              <span className="text-xs text-muted-foreground">
                {summary.total_reviews} review{summary.total_reviews !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Distribution */}
            <div className="flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => (
                <DistributionBar
                  key={star}
                  star={star}
                  count={summary.distribution[star] ?? 0}
                  total={summary.total_reviews}
                />
              ))}
            </div>

            {/* Write review button */}
            <div className="flex-shrink-0">
              <Button
                size="sm"
                variant={showForm ? 'secondary' : 'default'}
                onClick={() => setShowForm(!showForm)}
                className="gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {showForm ? 'Cancel' : 'Write a Review'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Write Review Form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Write a Review</h3>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Rating</label>
            <StarRating
              rating={reviewRating}
              interactive
              onRate={setReviewRating}
              size="lg"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Title (optional)
            </label>
            <input
              type="text"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="Summary of your experience"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Review (optional)
            </label>
            <Textarea
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              placeholder="Share details about your experience..."
              rows={4}
              className="resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitReview}
              disabled={createMutation.isPending || reviewRating === 0}
            >
              {createMutation.isPending ? 'Submitting...' : 'Submit Review'}
            </Button>
          </div>
        </div>
      )}

      {/* Sort + Reviews List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Reviews
            {reviewsData && reviewsData.total > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                ({reviewsData.total})
              </span>
            )}
          </h3>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ReviewSortOption)}
            className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {reviewsLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="h-4 w-24 bg-muted rounded mb-2" />
                <div className="h-3 w-full bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No reviews yet. Be the first to review!
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-xl border border-border bg-card p-4 space-y-2"
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StarRating rating={review.rating} />
                    {review.is_verified_user && (
                      <span className="inline-flex items-center rounded-full bg-green-500/10 text-green-600 px-2 py-0.5 text-[10px] font-medium">
                        Verified
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                    {currentUserId && review.user_id === currentUserId && (
                      <button
                        onClick={() => handleDelete(review.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-red-500"
                        title="Delete your review"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Title */}
                {review.title && (
                  <h4 className="text-sm font-medium text-foreground">
                    {review.title}
                  </h4>
                )}

                {/* Body */}
                {review.body && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {review.body}
                  </p>
                )}

                {/* Helpful buttons */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => handleHelpful(review.id, true)}
                    disabled={helpfulMutation.isPending}
                    className={cn(
                      'flex items-center gap-1 text-xs transition-colors rounded px-1.5 py-0.5',
                      review.user_voted_helpful === true
                        ? 'text-green-600 bg-green-500/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    <ThumbsUp className="h-3 w-3" />
                    Helpful
                  </button>
                  <button
                    onClick={() => handleHelpful(review.id, false)}
                    disabled={helpfulMutation.isPending}
                    className={cn(
                      'flex items-center gap-1 text-xs transition-colors rounded px-1.5 py-0.5',
                      review.user_voted_helpful === false
                        ? 'text-red-500 bg-red-500/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                  {review.helpful_count > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {review.helpful_count} found this helpful
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
