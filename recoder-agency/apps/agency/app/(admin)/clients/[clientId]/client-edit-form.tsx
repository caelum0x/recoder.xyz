"use client";

import { TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteClient, updateClient } from "../actions";

interface ClientEditFormProps {
	client: {
		id: string;
		name: string;
		email: string | null;
		company: string | null;
		phone: string | null;
		notes: string | null;
		status: string;
	};
}

export function ClientEditForm({ client }: ClientEditFormProps) {
	const router = useRouter();
	const [showDelete, setShowDelete] = useState(false);

	const updateWithId = updateClient.bind(null, client.id);

	return (
		<div className="space-y-4">
			<form
				action={updateWithId}
				className="rounded-xl border border-border bg-background p-4 space-y-3"
			>
				<h2 className="text-sm font-medium text-text-muted mb-2">
					Edit Client
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<label
							htmlFor="name"
							className="block text-xs text-text-muted mb-1"
						>
							Name *
						</label>
						<input
							id="name"
							name="name"
							type="text"
							required
							defaultValue={client.name}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div>
						<label
							htmlFor="email"
							className="block text-xs text-text-muted mb-1"
						>
							Email
						</label>
						<input
							id="email"
							name="email"
							type="email"
							defaultValue={client.email ?? ""}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div>
						<label
							htmlFor="company"
							className="block text-xs text-text-muted mb-1"
						>
							Company
						</label>
						<input
							id="company"
							name="company"
							type="text"
							defaultValue={client.company ?? ""}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div>
						<label
							htmlFor="phone"
							className="block text-xs text-text-muted mb-1"
						>
							Phone
						</label>
						<input
							id="phone"
							name="phone"
							type="text"
							defaultValue={client.phone ?? ""}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div>
						<label
							htmlFor="status"
							className="block text-xs text-text-muted mb-1"
						>
							Status
						</label>
						<select
							id="status"
							name="status"
							defaultValue={client.status}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="lead">Lead</option>
							<option value="active">Active</option>
							<option value="inactive">Inactive</option>
						</select>
					</div>
				</div>
				<div>
					<label htmlFor="notes" className="block text-xs text-text-muted mb-1">
						Notes
					</label>
					<textarea
						id="notes"
						name="notes"
						rows={3}
						defaultValue={client.notes ?? ""}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
					/>
				</div>
				<div className="flex items-center justify-between pt-2">
					<button
						type="submit"
						className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
					>
						Save Changes
					</button>
					<button
						type="button"
						onClick={() => setShowDelete(true)}
						className="inline-flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors"
					>
						<TrashIcon className="size-3.5" />
						Delete Client
					</button>
				</div>
			</form>

			{showDelete && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-lg">
						<h3 className="text-lg font-semibold text-text mb-2">
							Delete Client?
						</h3>
						<p className="text-sm text-text-muted mb-4">
							This will permanently delete this client and all associated data.
							This action cannot be undone.
						</p>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={async () => {
									await deleteClient(client.id);
								}}
								className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
							>
								Delete
							</button>
							<button
								type="button"
								onClick={() => setShowDelete(false)}
								className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg-hover transition-colors"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
