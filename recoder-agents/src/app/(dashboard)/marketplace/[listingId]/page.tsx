'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Star, CheckCircle2 } from 'lucide-react';

import {
  useMarketplaceListing,
  useListingReviews,
  useInstallAgent,
  useReviewAgent,
} from '@/hooks/marketplace/use-marketplace';
import { ReviewSection } from '@/components/marketplace/review-section';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-gray-500',
  development: 'bg-blue-500',
  research: 'bg-purple-500',
  writing: 'bg-green-500',
  data: 'bg-orange-500',
  support: 'bg-cyan-500',
  automation: 'bg-yellow-500',
  creative: 'bg-pink-500',
};

function StarRating({
  rating,
  interactive = false,
  onRate,
  size = 'sm',
}: {
  rating: number;
  interactive?: boolean;
  onRate?: (r: number) => void;
  size?: 'sm' | 'md';
}) {
  const [hovered, setHovered] = useState(0);
  const sizeClass = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';

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

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.listingId as string;

  const { data: listing, isLoading: listingLoading } = useMarketplaceListing(listingId);
  const { data: reviewsData, isLoading: reviewsLoading } = useListingReviews(listingId);
  const installMutation = useInstallAgent();
  const reviewMutation = useReviewAgent();

  const [activeTab, setActiveTab] = useState<'overview' | 'reviews'>('overview');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [installed, setInstalled] = useState(false);

  const reviews = reviewsData?.reviews ?? [];

  const handleInstall = async () => {
    try {
      const result = await installMutation.mutateAsync(listingId);
      setInstalled(true);
      if (result.new_agent_id) {
        toast.success('Agent installed successfully!');
        router.push(`/agents/config/${result.new_agent_id}`);
      } else {
        toast.info('Agent already installed.');
      }
    } catch {
      toast.error('Failed to install agent.');
    }
  };

  const handleReview = async () => {
    if (reviewRating === 0) {
      toast.error('Please select a rating.');
      return;
    }
    try {
      await reviewMutation.mutateAsync({
        listingId,
        body: { rating: reviewRating, comment: reviewComment },
      });
      toast.success('Review submitted!');
      setReviewRating(0);
      setReviewComment('');
    } catch {
      toast.error('Failed to submit review.');
    }
  };

  if (listingLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse space-y-6">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 bg-muted rounded-xl" />
            <div className="space-y-2 flex-1">
              <div className="h-6 w-48 bg-muted rounded" />
              <div className="h-4 w-64 bg-muted rounded" />
            </div>
          </div>
          <div className="h-40 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-medium mb-2">Listing not found</h2>
          <Button variant="outline" onClick={() => router.push('/marketplace')}>
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  const firstLetter = listing.title.charAt(0).toUpperCase();
  const bgColor = CATEGORY_COLORS[listing.category] || 'bg-gray-500';
  const agentConfig = listing.agent_config as Record<string, unknown>;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back */}
        <button
          onClick={() => router.push('/marketplace')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Marketplace
        </button>

        {/* Hero */}
        <div className="flex items-start gap-4 mb-6">
          {listing.icon_url ? (
            <img
              src={listing.icon_url}
              alt={listing.title}
              className="h-16 w-16 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div
              className={cn(
                'h-16 w-16 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0',
                bgColor,
              )}
            >
              {firstLetter}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{listing.title}</h1>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white',
                  bgColor,
                )}
              >
                {listing.category}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {listing.short_description}
            </p>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Download className="h-3.5 w-3.5" />
                {listing.install_count} install{listing.install_count !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <StarRating rating={listing.avg_rating} />
                <span className="ml-1">
                  {listing.avg_rating > 0 ? listing.avg_rating.toFixed(1) : '--'}
                </span>
                <span>({listing.review_count})</span>
              </span>
            </div>
          </div>
          <div className="flex-shrink-0">
            {installed ? (
              <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Installed
              </div>
            ) : (
              <Button
                onClick={handleInstall}
                disabled={installMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {installMutation.isPending ? 'Installing...' : 'Install Agent'}
              </Button>
            )}
          </div>
        </div>

        {/* Tags */}
        {listing.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {listing.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-border mb-6">
          <div className="flex gap-6">
            {(['overview', 'reviews'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'pb-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px',
                  activeTab === tab
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab}
                {tab === 'reviews' && listing.review_count > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({listing.review_count})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Description */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-2">Description</h2>
              <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {listing.description || 'No description provided.'}
              </div>
            </div>

            {/* Agent Config Info */}
            {agentConfig && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Agent Configuration</h2>
                {agentConfig.model && (
                  <div>
                    <span className="text-xs text-muted-foreground">Model:</span>
                    <span className="text-xs text-foreground ml-2">{String(agentConfig.model)}</span>
                  </div>
                )}
                {agentConfig.system_prompt && (
                  <div>
                    <span className="text-xs text-muted-foreground">System Prompt:</span>
                    <p className="text-xs text-foreground mt-1 bg-muted/50 rounded-lg p-2 whitespace-pre-line max-h-40 overflow-y-auto">
                      {String(agentConfig.system_prompt)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <ReviewSection listingId={listingId} />
        )}
      </div>
    </div>
  );
}
