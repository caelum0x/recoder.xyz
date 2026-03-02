export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-24">
        <div className="animate-pulse space-y-8">
          {/* Header skeleton */}
          <div className="space-y-3">
            <div className="h-8 w-64 bg-white/10 rounded-lg" />
            <div className="h-4 w-96 bg-white/5 rounded" />
          </div>
          {/* Stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-white/5 rounded-2xl border border-white/10" />
            ))}
          </div>
          {/* Content area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-white/5 rounded-2xl border border-white/10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
