"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangleIcon, RefreshCcwIcon } from "lucide-react";

export default function DashboardError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[agency/dashboard] Page error:", error);
	}, [error]);

	const isDbError =
		error.message?.includes("relation") ||
		error.message?.includes("does not exist") ||
		error.message?.includes("connection") ||
		error.message?.includes("ECONNREFUSED") ||
		error.message?.includes("pool");

	return (
		<div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
			<div className="rounded-full bg-amber-500/10 p-4">
				<AlertTriangleIcon className="h-8 w-8 text-amber-500" />
			</div>
			<h1 className="text-2xl font-bold">Dashboard Unavailable</h1>
			<p className="text-muted-foreground max-w-md">
				{isDbError
					? "The agency database tables may not be fully provisioned. Please run the database migrations and try again."
					: "An unexpected error occurred while loading the dashboard."}
			</p>
			{error.digest && (
				<p className="text-xs text-muted-foreground/60">
					Error ID: {error.digest}
				</p>
			)}
			<div className="flex gap-3">
				<button
					type="button"
					onClick={reset}
					className="inline-flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
				>
					<RefreshCcwIcon className="h-4 w-4" />
					Retry
				</button>
				<Link
					href="/"
					className="px-6 py-2 border border-border rounded-md hover:bg-accent transition-colors"
				>
					Return Home
				</Link>
			</div>
		</div>
	);
}
