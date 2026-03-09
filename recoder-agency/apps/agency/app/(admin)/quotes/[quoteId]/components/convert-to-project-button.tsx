"use client";

import { FolderIcon } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
import { convertQuoteToProject } from "../../actions";

interface ConvertToProjectButtonProps {
	quoteId: string;
	quoteTitle: string;
}

export function ConvertToProjectButton({
	quoteId,
	quoteTitle,
}: ConvertToProjectButtonProps) {
	const [showConfirm, setShowConfirm] = useState(false);
	const [isPending, startTransition] = useTransition();

	const handleConvert = useCallback(() => {
		startTransition(async () => {
			await convertQuoteToProject(quoteId);
		});
	}, [quoteId]);

	return (
		<>
			<button
				type="button"
				onClick={() => setShowConfirm(true)}
				className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 transition-colors"
			>
				<FolderIcon className="size-3.5" />
				Convert to Project
			</button>

			{showConfirm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
					<div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
						<h3 className="text-lg font-semibold text-text mb-2">
							Convert Quote to Project
						</h3>
						<p className="text-sm text-text-muted mb-4">
							This will create a new project from{" "}
							<span className="font-medium text-text">
								&ldquo;{quoteTitle}&rdquo;
							</span>{" "}
							and link it to this quote. This action cannot be undone.
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setShowConfirm(false)}
								disabled={isPending}
								className="rounded-lg border border-border px-4 py-2 text-sm text-text hover:bg-bg-hover transition-colors disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleConvert}
								disabled={isPending}
								className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
							>
								{isPending ? "Converting..." : "Yes, Convert"}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
