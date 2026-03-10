"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AuthError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("Auth error:", error);
	}, [error]);

	return (
		<div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
			<h2 className="text-xl font-semibold">Something went wrong</h2>
			<p className="text-sm text-muted-foreground text-center">
				{error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
			</p>
			<div className="flex gap-3">
				<button
					type="button"
					onClick={reset}
					className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
				>
					Try Again
				</button>
				<Link
					href="/login"
					className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors text-sm"
				>
					Back to Login
				</Link>
			</div>
		</div>
	);
}
