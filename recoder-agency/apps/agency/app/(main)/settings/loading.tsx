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
					<div className="h-8 bg-surface/10 rounded w-48" />
					<div className="flex gap-4">
						<div className="h-10 bg-surface/10 rounded w-28" />
						<div className="h-10 bg-surface/10 rounded w-28" />
						<div className="h-10 bg-surface/10 rounded w-28" />
					</div>
					<div className="space-y-4">
						<div className="h-16 bg-surface/10 rounded" />
						<div className="h-16 bg-surface/10 rounded" />
						<div className="h-16 bg-surface/10 rounded" />
					</div>
				</div>
			</div>
		</div>
	);
}
