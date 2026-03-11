'use client';

import { useState } from 'react';
import {
  Star,
  ThumbsUp,
  Trash2,
  MessageSquare,
  Pencil,
  Plus,
  Minus,
  X,
} from 'lucide-react';
import {
  useMarketplaceReviews,
  useRatingSummary,
  useCreateReview,
  useUpdateReview,
  useDeleteReview,
  useVoteHelpful,
} from '@/hooks/marketplace/use-marketplace-reviews';
import type { ReviewSortOption, MarketplaceReview } from '@/lib/api/marketplace-reviews';
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
  { value: 'most_helpful', label: 'Most Helpful' },
];

// ---------------------------------------------------------------------------
// Pros / Cons list editor
// ---------------------------------------------------------------------------

function ListEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  const addItem = () => {
    const trimmed = input.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setInput('');
    }
  };

  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addItem}
          className="h-8 w-8 p-0"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {items.map((item, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                className="hover:text-red-500 transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Write / Edit Review Dialog
// ---------------------------------------------------------------------------

function ReviewFormDialog({
  agentId,
  existingReview,
  onClose,
}: {
  agentId: string;
  existingReview?: MarketplaceReview;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [title, setTitle] = useState(existingReview?.title ?? '');
  const [content, setContent] = useState(existingReview?.content ?? '');
  const [pros, setPros] = useState<string[]>(existingReview?.pros ?? []);
  const [cons, setCons] = useState<string[]>(existingReview?.cons ?? []);

  const createMutation = useCreateReview();
  const updateMutation = useUpdateReview();

  const isEditing = !!existingReview;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Please select a rating.');
      return;
    }
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          reviewId: existingReview.id,
          body: {
            rating,
            title: title || undefined,
            content: content || undefined,
            pros: pros.length > 0 ? pros : undefined,
            cons: cons.length > 0 ? cons : undefined,
          },
          agentId,
        });
        toast.success('Review updated!');
      } else {
        await createMutation.mutateAsync({
          agent_id: agentId,
          rating,
          title: title || undefined,
          content: content || undefined,
          pros: pros.length > 0 ? pros : undefined,
          cons: cons.length > 0 ? cons : undefined,
        });
        toast.success('Review submitted!');
      }
      onClose();
    } catch {
      toast.error(isEditing ? 'Failed to update review.' : 'Failed to submit review.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            {isEditing ? 'Edit Review' : 'Write a Review'}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Rating */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Rating</label>
            <StarRating rating={rating} interactive onRate={setRating} size="lg" />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summary of your experience"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              maxLength={200}
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Review (optional)
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share details about your experience..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Pros */}
          <ListEditor
            label="Pros"
            items={pros}
            onChange={setPros}
            placeholder="Add a pro..."
          />

          {/* Cons */}
          <ListEditor
            label="Cons"
            items={cons}
            onChange={setCons}
            placeholder="Add a con..."
          />

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isPending || rating === 0}
            >
              {isPending
                ? 'Submitting...'
                : isEditing
                  ? 'Update Review'
                  : 'Submit Review'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Card
// ---------------------------------------------------------------------------

function ReviewCard({
  review,
  currentUserId,
  agentId,
  onEdit,
}: {
  review: MarketplaceReview;
  currentUserId?: string;
  agentId: string;
  onEdit: (review: MarketplaceReview) => void;
}) {
  const deleteMutation = useDeleteReview();
  const helpfulMutation = useVoteHelpful();
  const isOwner = currentUserId && review.user_id === currentUserId;

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ reviewId: review.id, agentId });
      toast.success('Review deleted.');
    } catch {
      toast.error('Failed to delete review.');
    }
  };

  const handleHelpful = async () => {
    try {
      await helpfulMutation.mutateAsync({ reviewId: review.id });
    } catch {
      toast.error('Failed to vote.');
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StarRating rating={review.rating} />
          {review.is_verified && (
            <span className="inline-flex items-center rounded-full bg-green-500/10 text-green-600 px-2 py-0.5 text-[10px] font-medium">
              Verified
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {new Date(review.created_at).toLocaleDateString()}
          </span>
          {isOwner && (
            <>
              <button
                onClick={() => onEdit(review)}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Edit your review"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-red-500"
                title="Delete your review"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      {review.title && (
        <h4 className="text-sm font-medium text-foreground">{review.title}</h4>
      )}

      {/* Content */}
      {review.content && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {review.content}
        </p>
      )}

      {/* Pros */}
      {review.pros && review.pros.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {review.pros.map((pro, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-full bg-green-500/10 text-green-600 px-2 py-0.5 text-[10px] font-medium"
            >
              <Plus className="h-2.5 w-2.5" />
              {pro}
            </span>
          ))}
        </div>
      )}

      {/* Cons */}
      {review.cons && review.cons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {review.cons.map((con, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-500 px-2 py-0.5 text-[10px] font-medium"
            >
              <Minus className="h-2.5 w-2.5" />
              {con}
            </span>
          ))}
        </div>
      )}

      {/* Helpful button */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleHelpful}
          disabled={helpfulMutation.isPending}
          className={cn(
            'flex items-center gap-1 text-xs transition-colors rounded px-1.5 py-0.5',
            'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          <ThumbsUp className="h-3 w-3" />
          Helpful
        </button>
        {review.helpful_count > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {review.helpful_count} found this helpful
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Section Component
// ---------------------------------------------------------------------------

interface ReviewSectionProps {
  agentId: string;
  currentUserId?: string;
}

export function ReviewSection({ agentId, currentUserId }: ReviewSectionProps) {
  const [sort, setSort] = useState<ReviewSortOption>('recent');
  const [showForm, setShowForm] = useState(false);
  const [editingReview, setEditingReview] = useState<MarketplaceReview | undefined>(
    undefined,
  );

  const { data: summary, isLoading: summaryLoading } = useRatingSummary(agentId);
  const { data: reviewsData, isLoading: reviewsLoading } = useMarketplaceReviews({
    agent_id: agentId,
    sort_by: sort,
  });

  const reviews = reviewsData?.reviews ?? [];

  const handleEdit = (review: MarketplaceReview) => {
    setEditingReview(review);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingReview(undefined);
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
                {summary.total_reviews} review
                {summary.total_reviews !== 1 ? 's' : ''}
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
                onClick={() => {
                  setEditingReview(undefined);
                  setShowForm(!showForm);
                }}
                className="gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {showForm ? 'Cancel' : 'Write a Review'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Write / Edit Review Dialog */}
      {showForm && (
        <ReviewFormDialog
          agentId={agentId}
          existingReview={editingReview}
          onClose={handleCloseForm}
        />
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
              <ReviewCard
                key={review.id}
                review={review}
                currentUserId={currentUserId}
                agentId={agentId}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
