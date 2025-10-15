export function LoadingSpinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className={`${sizes[size]} ${className}`}>
      <div className="animate-spin rounded-full h-full w-full border-b-2 border-orange-500"></div>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

export function InlineLoader({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <LoadingSpinner size="sm" />
      <span className="text-gray-400 text-sm">{text}</span>
    </div>
  );
}

export function ButtonLoader() {
  return <LoadingSpinner size="sm" className="inline-block" />;
}
