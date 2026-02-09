"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "./actions";

export function ClientDialog() {
	const router = useRouter();

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold text-text">Add Client</h2>
					<button
						type="button"
						onClick={() => router.push("/clients")}
						className="text-text-muted hover:text-text transition-colors"
					>
						<XIcon className="size-4" />
					</button>
				</div>
				<form action={createClient} className="space-y-3">
					<div>
						<label
							htmlFor="name"
							className="block text-sm font-medium text-text mb-1"
						>
							Name *
						</label>
						<input
							id="name"
							name="name"
							type="text"
							required
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div>
						<label
							htmlFor="email"
							className="block text-sm font-medium text-text mb-1"
						>
							Email
						</label>
						<input
							id="email"
							name="email"
							type="email"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div>
						<label
							htmlFor="company"
							className="block text-sm font-medium text-text mb-1"
						>
							Company
						</label>
						<input
							id="company"
							name="company"
							type="text"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div>
						<label
							htmlFor="phone"
							className="block text-sm font-medium text-text mb-1"
						>
							Phone
						</label>
						<input
							id="phone"
							name="phone"
							type="text"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div>
						<label
							htmlFor="status"
							className="block text-sm font-medium text-text mb-1"
						>
							Status
						</label>
						<select
							id="status"
							name="status"
							defaultValue="lead"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="lead">Lead</option>
							<option value="active">Active</option>
							<option value="inactive">Inactive</option>
						</select>
					</div>
					<div>
						<label
							htmlFor="notes"
							className="block text-sm font-medium text-text mb-1"
						>
							Notes
						</label>
						<textarea
							id="notes"
							name="notes"
							rows={3}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
						/>
					</div>
					<div className="flex gap-2 pt-2">
						<button
							type="submit"
							className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
						>
							Create Client
						</button>
						<button
							type="button"
							onClick={() => router.push("/clients")}
							className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg-hover transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
