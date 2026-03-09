import { CheckCircleIcon } from "lucide-react";
import Link from "next/link";

export default async function BriefConfirmationPage({
	searchParams,
}: {
	searchParams: Promise<{ briefId?: string }>;
}) {
	const { briefId } = await searchParams;

	return (
		<div className="max-w-lg mx-auto text-center py-16 space-y-6">
			<div className="flex justify-center">
				<CheckCircleIcon className="size-16 text-green-500" />
			</div>

			<div className="space-y-2">
				<h1 className="text-2xl font-bold text-text">Brief Submitted</h1>
				<p className="text-text-muted text-sm">
					Your brief has been received successfully.
				</p>
			</div>

			{briefId && (
				<div className="rounded-lg border border-border bg-background px-4 py-3 inline-block">
					<p className="text-xs text-text-muted">Reference ID</p>
					<p className="text-sm font-mono text-text mt-0.5">
						{briefId.slice(0, 8)}
					</p>
				</div>
			)}

			<p className="text-sm text-text-muted">
				We&apos;ll review your brief and get back to you within 2 business
				days.
			</p>

			<div className="flex justify-center gap-3 pt-2">
				<Link
					href="/portal/projects"
					className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
				>
					View Projects
				</Link>
				<Link
					href="/portal/briefs/new"
					className="rounded-lg border border-border px-6 py-2 text-sm font-medium text-text hover:bg-bg-hover transition-colors"
				>
					Submit Another
				</Link>
			</div>
		</div>
	);
}
