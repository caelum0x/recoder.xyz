'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Star, Search, SlidersHorizontal, Store } from 'lucide-react';

import { useMarketplaceListings } from '@/hooks/marketplace/use-marketplace';
import type { MarketplaceListing } from '@/lib/api/marketplace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'development', label: 'Development' },
  { value: 'research', label: 'Research' },
  { value: 'writing', label: 'Writing' },
  { value: 'data', label: 'Data' },
  { value: 'support', label: 'Support' },
  { value: 'automation', label: 'Automation' },
  { value: 'creative', label: 'Creative' },
] as const;

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

function ListingCard({ listing }: { listing: MarketplaceListing }) {
  const firstLetter = listing.title.charAt(0).toUpperCase();
  const bgColor = CATEGORY_COLORS[listing.category] || 'bg-gray-500';

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="group block rounded-xl border border-border bg-card p-4 transition-all hover:shadow-md hover:border-foreground/20"
    >
      <div className="flex items-start gap-3">
        {listing.icon_url ? (
          <img
            src={listing.icon_url}
            alt={listing.title}
            className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div
            className={cn(
              'h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0',
              bgColor,
            )}
          >
            {firstLetter}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm text-foreground group-hover:text-foreground/90 truncate">
            {listing.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {listing.short_description}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white',
            bgColor,
          )}
        >
          {listing.category}
        </span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {listing.install_count}
          </span>
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {listing.avg_rating > 0 ? listing.avg_rating.toFixed(1) : '--'}
          </span>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-full" />
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
        <div className="h-4 w-16 bg-muted rounded-full" />
        <div className="h-3 w-20 bg-muted rounded" />
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<'popular' | 'newest' | 'top_rated'>('popular');
  const [offset, setOffset] = useState(0);
  const limit = 18;

  const { data, isLoading } = useMarketplaceListings({
    category: category || undefined,
    search: search || undefined,
    sort,
    limit,
    offset,
  });

  const listings = data?.listings ?? [];
  const hasMore = data?.has_more ?? false;
  const total = data?.total ?? 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Store className="h-6 w-6 text-foreground" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Agent Marketplace</h1>
              <p className="text-sm text-muted-foreground">
                Browse and install agents built by the community
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/marketplace/my-listings')}
          >
            My Listings
          </Button>
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v as typeof sort);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="popular">Popular</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="top_rated">Highest Rated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => {
                setCategory(cat.value);
                setOffset(0);
              }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                category === cat.value
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Store className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              No agents found
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {search
                ? `No results for "${search}". Try a different search term.`
                : 'Be the first to publish an agent to the marketplace!'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              {total} agent{total !== 1 ? 's' : ''} found
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  onClick={() => setOffset((prev) => prev + limit)}
                >
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
