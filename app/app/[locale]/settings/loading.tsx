export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-24">
        <div className="animate-pulse space-y-8">
          {/* Header */}
          <div className="h-8 w-48 bg-white/10 rounded-lg" />
          {/* Tabs skeleton */}
          <div className="flex gap-4 border-b border-white/10 pb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-24 bg-white/5 rounded" />
            ))}
          </div>
          {/* Settings fields */}
          <div className="space-y-6 max-w-2xl">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-32 bg-white/10 rounded" />
                <div className="h-10 bg-white/5 rounded-xl border border-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
