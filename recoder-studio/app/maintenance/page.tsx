export default function MaintenancePage() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-black-900 text-white-850">
			<div className="mx-auto max-w-md text-center px-4">
				<h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl font-accent">
					We'll be back.
				</h1>
				<p className="mb-8 text-lg text-gray-400">
					We're busy updating Recoder Studio.
					<br /> Please check back soon.
				</p>
				{/* <div className="inline-flex items-center justify-center rounded-md border border-gray-800 px-4 py-2 text-sm font-medium text-gray-300">
					Maintenance in progress
				</div> */}
			</div>
		</div>
	);
}
