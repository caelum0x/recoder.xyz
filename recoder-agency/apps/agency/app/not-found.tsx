"use client";

import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
			<div className="flex justify-center">
				<img src="/logo.png" alt="Recoder" className="w-12 h-12" />
			</div>
			<h1 className="text-4xl font-bold">Page Not Found</h1>
			<p className="text-muted-foreground text-center max-w-md">
				The page you are looking for does not exist or has been moved.
			</p>
			<Link
				href="/"
				className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
			>
				Return Home
			</Link>
		</div>
	);
}
