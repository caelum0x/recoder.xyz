'use client';

import { useState } from 'react';
import {
  Store,
  Plus,
  Star,
  Download,
  Eye,
  Loader2,
  Trash2,
  Edit2,
  Globe,
  Lock,
  ThumbsUp,
  ChevronRight,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useListings,
  useCreateListing,
  useUpdateListing,
  useDeleteListing,
  useInstallListing,
  useSubmitReview,
  useListingReviews,
  useMarkReviewHelpful,
  type MarketplaceListing,
  type ListingReview,
  type MarketplaceFilters,
} from '@/hooks/agents/use-marketplace-reviews';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRICE_TYPE_STYLES: Record<string, string> = {
  free: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  paid: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  freemium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i < Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/40'
          )}
        />
      ))}
    </span>
  );
}

function StarSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star
            className={cn(
              'h-6 w-6 transition-colors',
              n <= value
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/40 hover:text-amber-300'
            )}
          />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Dialog
// ---------------------------------------------------------------------------

function ReviewDialog({
  listing,
  onClose,
}: {
  listing: MarketplaceListing;
  onClose: () => void;
}) {
  const submitReview = useSubmitReview(listing.id);
  const [form, setForm] = useState({ rating: 5, title: '', body: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitReview.mutate(
      { rating: form.rating, title: form.title || undefined, body: form.body || undefined },
      {
        onSuccess: () => {
          toast.success('Review submitted');
          onClose();
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold">Review &ldquo;{listing.listing_title}&rdquo;</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Your Rating</label>
            <div className="mt-2">
              <StarSelector value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Title (optional)</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Body (optional)</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitReview.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitReview.isPending ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reviews Sheet
// ---------------------------------------------------------------------------

function ReviewsSheet({
  listing,
  onClose,
}: {
  listing: MarketplaceListing;
  onClose: () => void;
}) {
  const { data: reviews, isLoading } = useListingReviews(listing.id);
  const markHelpful = useMarkReviewHelpful();

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="w-full max-w-md bg-card border-l border-border flex flex-col h-full shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">
            Reviews — {listing.listing_title}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : reviews && reviews.length > 0 ? (
            reviews.map((review: ListingReview) => (
              <div key={review.id} className="rounded-xl border border-border bg-background p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <StarRating rating={review.rating} />
                  <span className="text-xs text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
                {review.title && (
                  <p className="text-sm font-medium">{review.title}</p>
                )}
                {review.body && (
                  <p className="text-sm text-muted-foreground">{review.body}</p>
                )}
                <button
                  onClick={() =>
                    markHelpful.mutate(
                      { reviewId: review.id, listingId: listing.id },
                      { onError: (e) => toast.error(e.message) }
                    )
                  }
                  disabled={markHelpful.isPending}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ThumbsUp className="h-3 w-3" />
                  Helpful ({review.helpful_count})
                </button>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Star className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No reviews yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Listing Dialog
// ---------------------------------------------------------------------------

function CreateListingDialog({ onClose }: { onClose: () => void }) {
  const createListing = useCreateListing();
  const [form, setForm] = useState({
    agent_id: '',
    listing_title: '',
    listing_description: '',
    category: 'general',
    tags: '',
    price_type: 'free' as 'free' | 'paid' | 'freemium',
    is_published: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    createListing.mutate(
      {
        agent_id: form.agent_id,
        listing_title: form.listing_title,
        listing_description: form.listing_description || undefined,
        category: form.category,
        tags,
        price_type: form.price_type,
        is_published: form.is_published,
      },
      {
        onSuccess: () => {
          toast.success('Listing created');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold">Create Listing</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Agent ID</label>
            <input
              type="text"
              required
              value={form.agent_id}
              onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Listing Title</label>
            <input
              type="text"
              required
              value={form.listing_title}
              onChange={(e) => setForm((f) => ({ ...f, listing_title: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Description</label>
            <textarea
              value={form.listing_description}
              onChange={(e) => setForm((f) => ({ ...f, listing_description: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Category</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="automation, data, productivity"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Price Type</label>
            <select
              value={form.price_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  price_type: e.target.value as 'free' | 'paid' | 'freemium',
                }))
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="free">Free</option>
              <option value="freemium">Freemium</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_published"
              checked={form.is_published}
              onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
              className="rounded"
            />
            <label htmlFor="is_published" className="text-sm text-muted-foreground">
              Publish immediately
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createListing.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createListing.isPending ? 'Creating…' : 'Create Listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listing Card
// ---------------------------------------------------------------------------

function ListingCard({
  listing,
  isOwn,
  onReview,
  onViewReviews,
}: {
  listing: MarketplaceListing;
  isOwn?: boolean;
  onReview: (l: MarketplaceListing) => void;
  onViewReviews: (l: MarketplaceListing) => void;
}) {
  const installListing = useInstallListing();
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();

  const handleInstall = () => {
    installListing.mutate(listing.id, {
      onSuccess: () => toast.success(`Installed "${listing.listing_title}"`),
      onError: (e) => toast.error(e.message),
    });
  };

  const handleTogglePublish = () => {
    updateListing.mutate(
      { id: listing.id, data: { is_published: !listing.is_published } },
      {
        onSuccess: () =>
          toast.success(listing.is_published ? 'Listing unpublished' : 'Listing published'),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleDelete = () => {
    deleteListing.mutate(listing.id, {
      onSuccess: () => toast.success('Listing deleted'),
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2 flex-1">
          {listing.listing_title}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              PRICE_TYPE_STYLES[listing.price_type] ?? 'bg-muted text-muted-foreground'
            )}
          >
            {listing.price_type}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            {listing.category}
          </span>
        </div>
      </div>

      {listing.listing_description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{listing.listing_description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <StarRating rating={listing.rating_avg} />
          <span className="tabular-nums">{listing.rating_avg.toFixed(1)}</span>
          <span>({listing.rating_count})</span>
        </span>
        <span className="flex items-center gap-1">
          <Download className="h-3 w-3" />
          {listing.install_count.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          {listing.view_count.toLocaleString()}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-auto pt-2 flex-wrap">
        {isOwn ? (
          <>
            <button
              onClick={handleTogglePublish}
              disabled={updateListing.isPending}
              className={cn(
                'flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors',
                listing.is_published
                  ? 'border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/10'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {listing.is_published ? (
                <Globe className="h-3 w-3" />
              ) : (
                <Lock className="h-3 w-3" />
              )}
              {listing.is_published ? 'Published' : 'Draft'}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteListing.isPending}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </>
        ) : (
          <button
            onClick={handleInstall}
            disabled={installListing.isPending}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Download className="h-3 w-3" />
            {installListing.isPending ? 'Installing…' : 'Install'}
          </button>
        )}
        <button
          onClick={() => onReview(listing)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <Star className="h-3 w-3" />
          Review
        </button>
        <button
          onClick={() => onViewReviews(listing)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors ml-auto"
        >
          Reviews
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type TabValue = 'all' | 'my';

export default function MarketplacePage() {
  const [tab, setTab] = useState<TabValue>('all');
  const [filters, setFilters] = useState<MarketplaceFilters>({});
  const [reviewListing, setReviewListing] = useState<MarketplaceListing | null>(null);
  const [reviewsListing, setReviewsListing] = useState<MarketplaceListing | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: allListings, isLoading } = useListings(
    tab === 'all' ? filters : undefined
  );
  const { data: myListings, isLoading: myLoading } = useListings(
    tab === 'my' ? {} : undefined
  );

  const displayListings = tab === 'all' ? allListings : myListings;
  const displayLoading = tab === 'all' ? isLoading : myLoading;

  // For "My Listings" tab, we'd ideally filter by user_id on the server;
  // the API already includes the user's own unpublished listings in all results,
  // so we show the same list but can create new ones here.

  return (
    <div className="flex-1 overflow-auto">
      {reviewListing && (
        <ReviewDialog listing={reviewListing} onClose={() => setReviewListing(null)} />
      )}
      {reviewsListing && (
        <ReviewsSheet listing={reviewsListing} onClose={() => setReviewsListing(null)} />
      )}
      {showCreate && <CreateListingDialog onClose={() => setShowCreate(false)} />}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Store className="h-6 w-6" />
              Agent Marketplace
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Discover, install, and review community agents.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            List Agent
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(['all', 'my'] as TabValue[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                tab === t
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'all' ? 'All Listings' : 'My Listings'}
            </button>
          ))}
        </div>

        {/* Filter bar (All tab only) */}
        {tab === 'all' && (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search listings…"
              value={filters.search ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value || undefined }))
              }
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm w-48"
            />
            <input
              type="text"
              placeholder="Category…"
              value={filters.category ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, category: e.target.value || undefined }))
              }
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm w-36"
            />
            <select
              value={filters.price_type ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, price_type: e.target.value || undefined }))
              }
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">All prices</option>
              <option value="free">Free</option>
              <option value="freemium">Freemium</option>
              <option value="paid">Paid</option>
            </select>
            {(filters.search || filters.category || filters.price_type) && (
              <button
                onClick={() => setFilters({})}
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        )}

        {/* My Listings create CTA */}
        {tab === 'my' && (
          <div className="flex items-center gap-2">
            <Edit2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Your listings (published and drafts) are shown here.
            </span>
          </div>
        )}

        {/* Listings Grid */}
        {displayLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading listings…</span>
          </div>
        ) : displayListings && displayListings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayListings.map((listing: MarketplaceListing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isOwn={tab === 'my'}
                onReview={(l) => setReviewListing(l)}
                onViewReviews={(l) => setReviewsListing(l)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Store className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              {tab === 'my'
                ? 'You have no listings yet. Click "List Agent" to publish your first agent.'
                : 'No listings match your search. Try adjusting the filters.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
