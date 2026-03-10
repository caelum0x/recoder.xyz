export default function Loading() {
	return (
		<div className="flex h-screen bg-bg">
			<div className="w-[200px] bg-bg border-r border-border animate-pulse">
				<div className="p-4 border-b border-border">
					<div className="h-6 bg-surface/10 rounded mb-4" />
					<div className="h-8 bg-surface/10 rounded" />
				</div>
				<div className="p-4 space-y-3">
					<div className="h-4 bg-surface/10 rounded" />
					<div className="h-4 bg-surface/10 rounded" />
					<div className="h-4 bg-surface/10 rounded" />
				</div>
			</div>
			<div className="flex-1 p-6">
				<div className="max-w-[900px] mx-auto space-y-6 animate-pulse">
					<div className="h-8 bg-surface/10 rounded w-72" />
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="h-40 bg-surface/10 rounded" />
						<div className="h-40 bg-surface/10 rounded" />
					</div>
					<div className="space-y-3">
						<div className="h-12 bg-surface/10 rounded" />
						<div className="h-12 bg-surface/10 rounded" />
						<div className="h-12 bg-surface/10 rounded" />
					</div>
				</div>
			</div>
		</div>
	);
}
