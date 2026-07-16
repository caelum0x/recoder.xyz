export function Skeleton({ className = '', variant = 'default' }: { className?: string; variant?: 'default' | 'circular' }) {
  return (
    <div className={`animate-pulse bg-gray-700 ${variant === 'circular' ? 'rounded-full' : 'rounded-lg'} ${className}`} />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
