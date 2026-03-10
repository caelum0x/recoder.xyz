'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Star, Pencil, XCircle, Store } from 'lucide-react';

import { useMyListings, useDeleteListing } from '@/hooks/marketplace/use-marketplace';
import type { MarketplaceListing } from '@/lib/api/marketplace';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  published: { label: 'Published', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  under_review: { label: 'Under Review', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function ListingRow({ listing }: { listing: MarketplaceListing }) {
  const router = useRouter();
  const deleteMutation = useDeleteListing();

  const statusInfo = STATUS_STYLES[listing.status] ?? STATUS_STYLES.draft;

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to unpublish this agent? This cannot be undone.')) return;
    try {
      await deleteMutation.mutateAsync(listing.id);
      toast.success('Listing removed.');
    } catch {
      toast.error('Failed to remove listing.');
    }
  };

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm text-foreground truncate">
            {listing.title}
          </h3>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              statusInfo.className,
            )}
          >
            {statusInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {listing.install_count} installs
          </span>
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {listing.avg_rating > 0 ? listing.avg_rating.toFixed(1) : '--'}
          </span>
          <span>{listing.category}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/marketplace/${listing.id}`)}
        >
          <Pencil className="h-3 w-3 mr-1" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <XCircle className="h-3 w-3 mr-1" />
          Unpublish
        </Button>
      </div>
    </div>
  );
}

export default function MyListingsPage() {
  const router = useRouter();
  const { data, isLoading } = useMyListings();

  const listings = data?.listings ?? [];

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

        <div className="flex items-center gap-3 mb-6">
          <Store className="h-6 w-6 text-foreground" />
          <h1 className="text-2xl font-bold text-foreground">My Published Agents</h1>
        </div>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="h-4 w-48 bg-muted rounded mb-2" />
                <div className="h-3 w-32 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Store className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              You haven&apos;t published any agents yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Publish one of your agents to share it with the community.
            </p>
            <Button
              variant="outline"
              onClick={() => router.push('/marketplace')}
            >
              Browse Marketplace
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
