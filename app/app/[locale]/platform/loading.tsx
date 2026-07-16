export default function PlatformLoading() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-24">
        <div className="animate-pulse space-y-8">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="h-10 w-72 bg-white/10 rounded-lg mx-auto" />
            <div className="h-4 w-96 bg-white/5 rounded mx-auto" />
          </div>
          {/* Platform cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 bg-white/5 rounded-2xl border border-white/10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
