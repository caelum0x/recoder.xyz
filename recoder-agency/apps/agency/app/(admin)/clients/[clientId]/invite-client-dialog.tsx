"use client";

import { CheckIcon, Loader2Icon, MailIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { inviteClientToPortal } from "../actions";

interface InviteClientDialogProps {
	clientId: string;
	clientName: string;
	clientEmail: string;
	onClose: () => void;
}

export function InviteClientDialog({
	clientId,
	clientName,
	clientEmail,
	onClose,
}: InviteClientDialogProps) {
	const [status, setStatus] = useState<
		"idle" | "loading" | "success" | "error"
	>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleInvite = async () => {
		setStatus("loading");
		setErrorMessage(null);

		const result = await inviteClientToPortal(clientId);

		if (result.success) {
			setStatus("success");
			setTimeout(() => {
				onClose();
			}, 2000);
		} else {
			setStatus("error");
			setErrorMessage(result.error ?? "Failed to send invitation");
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<div
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Escape" && onClose()}
			/>
			<div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
				<button
					type="button"
					onClick={onClose}
					className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors"
				>
					<XIcon className="size-5" />
				</button>

				<div className="flex items-center gap-3 mb-6">
					<div className="flex items-center justify-center size-10 rounded-full bg-primary/10">
						<MailIcon className="size-5 text-primary" />
					</div>
					<div>
						<h2 className="text-lg font-semibold text-text">
							Invite to Client Portal
						</h2>
						<p className="text-sm text-text-muted">
							Send portal access to {clientName}
						</p>
					</div>
				</div>

				<div className="space-y-4">
					<div className="rounded-lg border border-border bg-bg-hover p-4">
						<p className="text-sm text-text-muted mb-1">
							Invitation will be sent to:
						</p>
						<p className="text-sm font-medium text-text">{clientEmail}</p>
					</div>

					<p className="text-sm text-text-muted">
						The client will receive an email with a link to create an account
						and access their portal where they can view projects, submit briefs,
						and review deliverables.
					</p>

					{status === "error" && errorMessage && (
						<div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
							<p className="text-sm text-red-400">{errorMessage}</p>
						</div>
					)}

					{status === "success" ? (
						<div className="flex items-center justify-center gap-2 rounded-lg bg-green-500/10 border border-green-500/30 p-4">
							<CheckIcon className="size-5 text-green-400" />
							<span className="text-sm font-medium text-green-400">
								Invitation sent successfully!
							</span>
						</div>
					) : (
						<div className="flex gap-3">
							<button
								type="button"
								onClick={onClose}
								className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg-hover transition-colors"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleInvite}
								disabled={status === "loading"}
								className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{status === "loading" ? (
									<>
										<Loader2Icon className="size-4 animate-spin" />
										Sending...
									</>
								) : (
									"Send Invitation"
								)}
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
