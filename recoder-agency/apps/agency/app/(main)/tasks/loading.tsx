export default function Loading() {
	return (
		<div className="flex h-screen bg-bg">
			<div className="flex-1 p-6">
				<div className="max-w-[900px] mx-auto space-y-6 animate-pulse">
					<div className="h-8 bg-surface/10 rounded w-48" />
					<div className="flex gap-4 mb-6">
						<div className="h-10 bg-surface/10 rounded flex-1" />
						<div className="h-10 bg-surface/10 rounded w-32" />
					</div>
					<div className="space-y-3">
						{[1, 2, 3, 4, 5].map((i) => (
							<div key={i} className="h-16 bg-surface/10 rounded" />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
