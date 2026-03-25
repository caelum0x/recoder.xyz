"use client";

import { useEffect } from "react";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[agency/global-error]", error);
		// Report to Sentry if available (dynamic import to avoid crash if Sentry is not configured)
		import("@sentry/nextjs")
			.then((Sentry) => Sentry.captureException(error))
			.catch(() => {});
	}, [error]);

	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					fontFamily:
						'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
					background: "#0a0a0a",
					color: "#e5e5e5",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						minHeight: "100vh",
						gap: "1.5rem",
						padding: "1rem",
						textAlign: "center",
					}}
				>
					<img
						src="/logo.png"
						alt="Recoder"
						width={48}
						height={48}
						style={{ borderRadius: 8 }}
					/>
					<h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
						Something went wrong
					</h1>
					<p
						style={{
							color: "#a1a1a1",
							maxWidth: "28rem",
							margin: 0,
							lineHeight: 1.5,
						}}
					>
						An unexpected error occurred. This may be caused by missing database
						migrations or a configuration issue.
					</p>
					{error.digest && (
						<p style={{ color: "#666", fontSize: "0.75rem", margin: 0 }}>
							Error ID: {error.digest}
						</p>
					)}
					<div style={{ display: "flex", gap: "0.75rem" }}>
						<button
							type="button"
							onClick={reset}
							style={{
								padding: "0.5rem 1.5rem",
								background: "#fff",
								color: "#000",
								border: "none",
								borderRadius: "0.375rem",
								cursor: "pointer",
								fontWeight: 500,
							}}
						>
							Try Again
						</button>
						<a
							href="/"
							style={{
								padding: "0.5rem 1.5rem",
								background: "transparent",
								color: "#e5e5e5",
								border: "1px solid #333",
								borderRadius: "0.375rem",
								textDecoration: "none",
								fontWeight: 500,
							}}
						>
							Return Home
						</a>
					</div>
				</div>
			</body>
		</html>
	);
}
