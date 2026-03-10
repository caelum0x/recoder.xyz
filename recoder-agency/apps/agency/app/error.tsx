"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("Application error:", error);
	}, [error]);

	return (
		<div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
			<div className="flex justify-center">
				<img src="/logo.png" alt="Recoder" className="w-12 h-12" />
			</div>
			<h1 className="text-4xl font-bold">Something went wrong</h1>
			<p className="text-muted-foreground text-center max-w-md">
				An unexpected error occurred. Please try again.
			</p>
			{error.digest && (
				<p className="text-sm text-muted-foreground/70">
					Error ID: {error.digest}
				</p>
			)}
			<div className="flex gap-3">
				<button
					type="button"
					onClick={reset}
					className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
				>
					Try Again
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
