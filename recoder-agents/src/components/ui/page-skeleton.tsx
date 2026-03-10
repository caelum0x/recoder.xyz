'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface PageSkeletonProps {
  variant: 'dashboard' | 'list' | 'detail' | 'grid';
  className?: string;
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Stat cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
          >
            <Skeleton className="h-3 w-20 rounded-lg" />
            <Skeleton className="h-7 w-28 rounded-lg" />
            <Skeleton className="h-2.5 w-16 rounded-lg" />
          </div>
        ))}
      </div>
      {/* Content area */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-40 mb-4 rounded-lg" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Search bar */}
      <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
      {/* List items */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4"
          >
            <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton className="h-4 w-48 rounded-lg" />
              <Skeleton className="h-3 w-72 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-20 rounded-lg shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56 rounded-lg" />
          <Skeleton className="h-3.5 w-80 rounded-lg" />
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      {/* Content */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-full rounded-lg" />
          <Skeleton className="h-4 w-5/6 rounded-lg" />
          <Skeleton className="h-4 w-4/6 rounded-lg" />
          <Skeleton className="h-40 w-full rounded-xl mt-2" />
        </div>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Optional header */}
      <Skeleton className="h-5 w-32 rounded-lg" />
      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
          >
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4 rounded-lg" />
            <Skeleton className="h-3 w-1/2 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

const variantMap = {
  dashboard: DashboardSkeleton,
  list: ListSkeleton,
  detail: DetailSkeleton,
  grid: GridSkeleton,
} as const;

export function PageSkeleton({ variant, className }: PageSkeletonProps) {
  const Component = variantMap[variant];
  return (
    <div className={cn('w-full animate-in fade-in duration-300', className)}>
      <Component />
    </div>
  );
}
