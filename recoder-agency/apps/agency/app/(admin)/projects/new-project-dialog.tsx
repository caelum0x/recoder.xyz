"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { createProject, createProjectFromTemplate } from "./actions";

interface NewProjectDialogProps {
	clients: { id: string; name: string }[];
	templates: { id: string; name: string | null }[];
	serviceSkus: {
		dbId: number;
		id: string;
		code: string;
		name: string;
		scope: string;
		priceCents: number;
		currency: string;
		slaDays: number;
		revisionLimit: number;
	}[];
	preselectedTemplate: string | null;
}

export function NewProjectDialog({
	clients,
	templates,
	serviceSkus,
	preselectedTemplate,
}: NewProjectDialogProps) {
	const router = useRouter();

	const handleSubmit = async (formData: FormData) => {
		const templateId = formData.get("templateWorkspaceId") as string;
		if (templateId) {
			await createProjectFromTemplate(formData);
		} else {
			await createProject(formData);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold text-text">New Project</h2>
					<button
						type="button"
						onClick={() => router.push("/projects")}
						className="text-text-muted hover:text-text transition-colors"
					>
						<XIcon className="size-4" />
					</button>
				</div>
				<form action={handleSubmit} className="space-y-3">
					<div>
						<label
							htmlFor="name"
							className="block text-sm font-medium text-text mb-1"
						>
							Project Name *
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
							htmlFor="clientId"
							className="block text-sm font-medium text-text mb-1"
						>
							Client *
						</label>
						<select
							id="clientId"
							name="clientId"
							required
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="">Select a client...</option>
							{clients.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</select>
					</div>
					<div>
						<label
							htmlFor="templateWorkspaceId"
							className="block text-sm font-medium text-text mb-1"
						>
							Template (optional)
						</label>
						<select
							id="templateWorkspaceId"
							name="templateWorkspaceId"
							defaultValue={preselectedTemplate ?? ""}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="">No template</option>
							{templates.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name ?? "Untitled Workspace"}
								</option>
							))}
						</select>
					</div>
					<div>
						<label
							htmlFor="serviceSkuDbId"
							className="block text-sm font-medium text-text mb-1"
						>
							Service SKU
						</label>
						<select
							id="serviceSkuDbId"
							name="serviceSkuDbId"
							defaultValue=""
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="">No SKU (requires override reason)</option>
							{serviceSkus.map((sku) => (
								<option key={sku.id} value={String(sku.dbId)}>
									{sku.code} - {sku.name} ({sku.currency.toUpperCase()}{" "}
									{(sku.priceCents / 100).toFixed(2)})
								</option>
							))}
						</select>
						<p className="mt-1 text-xs text-text-muted">
							Choose a fixed-scope SKU for standard delivery economics.
						</p>
					</div>
					<div>
						<label
							htmlFor="scopeOverrideReason"
							className="block text-sm font-medium text-text mb-1"
						>
							Scope Override Reason
						</label>
						<textarea
							id="scopeOverrideReason"
							name="scopeOverrideReason"
							rows={2}
							placeholder="Required if no SKU is selected"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
						/>
					</div>
					<div>
						<label
							htmlFor="brief"
							className="block text-sm font-medium text-text mb-1"
						>
							Brief
						</label>
						<textarea
							id="brief"
							name="brief"
							rows={3}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
						/>
					</div>
					<div className="flex gap-2 pt-2">
						<button
							type="submit"
							className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
						>
							Create Project
						</button>
						<button
							type="button"
							onClick={() => router.push("/projects")}
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
