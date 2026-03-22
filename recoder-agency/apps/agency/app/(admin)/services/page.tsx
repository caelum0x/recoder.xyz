import { ArchiveIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { getAllServices } from "@/lib/agency/service-catalog";
import { fetchCurrentTeam } from "@/services/teams";
import { archiveService, createService, restoreService } from "./actions";

function formatCurrency(cents: number, currency?: string | null) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: (currency ?? "USD").toUpperCase(),
	}).format(cents / 100);
}

export default async function ServicesPage({
	searchParams,
}: {
	searchParams: Promise<{ new?: string; showArchived?: string }>;
}) {
	const query = await searchParams;
	const team = await fetchCurrentTeam();
	let allServices: Awaited<ReturnType<typeof getAllServices>> = [];
	try {
		allServices = await getAllServices(team.dbId);
	} catch {
		// service_catalog table may not exist yet
	}
	const showArchived = query.showArchived === "1";
	const services = showArchived
		? allServices
		: allServices.filter((s) => s.status === "active");

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-text">Service Catalog</h1>
					<p className="text-text-muted text-sm mt-1">
						Fixed-scope services your agency offers
					</p>
				</div>
				<div className="flex gap-2">
					<a
						href={showArchived ? "/services" : "/services?showArchived=1"}
						className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors"
					>
						<ArchiveIcon className="size-3.5" />
						{showArchived ? "Hide Archived" : "Show Archived"}
					</a>
					<a
						href="/services?new=1"
						className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
					>
						<PlusIcon className="size-3.5" />
						Add Service
					</a>
				</div>
			</div>

			{query.new === "1" && (
				<form
					action={async (formData) => {
						"use server";
						await createService(formData);
						redirect("/services");
					}}
					className="rounded-xl border border-border bg-background p-4 space-y-3"
				>
					<h2 className="text-sm font-medium text-text">New Service</h2>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label
								htmlFor="svc-name"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Name *
							</label>
							<input
								id="svc-name"
								name="name"
								required
								placeholder="e.g. Landing Page Build"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div>
							<label
								htmlFor="svc-price"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Price (USD) *
							</label>
							<input
								id="svc-price"
								name="price"
								type="number"
								step="0.01"
								min="0"
								required
								placeholder="0.00"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div>
							<label
								htmlFor="svc-days"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Estimated Days
							</label>
							<input
								id="svc-days"
								name="estimatedDays"
								type="number"
								min="1"
								placeholder="e.g. 5"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div>
							<label
								htmlFor="svc-type"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Deliverable Type
							</label>
							<select
								id="svc-type"
								name="deliverableType"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							>
								<option value="">None</option>
								<option value="document">Document</option>
								<option value="code">Code</option>
								<option value="design">Design</option>
								<option value="other">Other</option>
							</select>
						</div>
					</div>
					<div>
						<label
							htmlFor="svc-desc"
							className="block text-xs font-medium text-text-muted mb-1"
						>
							Description
						</label>
						<textarea
							id="svc-desc"
							name="description"
							rows={3}
							placeholder="What's included in this service..."
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div className="flex gap-2">
						<button
							type="submit"
							className="rounded-lg bg-primary px-4 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
						>
							Create
						</button>
						<a
							href="/services"
							className="rounded-lg border border-border px-4 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors"
						>
							Cancel
						</a>
					</div>
				</form>
			)}

			{services.length === 0 ? (
				<p className="text-text-muted text-sm">
					No services yet. Add your first service to get started.
				</p>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{services.map((service) => (
						<div
							key={service.id}
							className={`rounded-xl border border-border bg-background p-4 ${
								service.status === "archived" ? "opacity-60" : ""
							}`}
						>
							<div className="flex items-start justify-between gap-2">
								<h3 className="text-sm font-semibold text-text">
									{service.name}
								</h3>
								<span
									className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
										service.status === "active"
											? "bg-green-100 text-green-700"
											: "bg-gray-100 text-gray-500"
									}`}
								>
									{service.status}
								</span>
							</div>
							{service.description && (
								<p className="mt-2 text-xs text-text-muted line-clamp-2">
									{service.description}
								</p>
							)}
							<div className="mt-3 flex items-center justify-between">
								<span className="text-lg font-bold text-text">
									{formatCurrency(service.priceCents, service.currency)}
								</span>
								{service.estimatedDays && (
									<span className="text-xs text-text-muted">
										{service.estimatedDays} day
										{service.estimatedDays !== 1 ? "s" : ""}
									</span>
								)}
							</div>
							{service.deliverableType && (
								<span className="mt-2 inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium capitalize">
									{service.deliverableType}
								</span>
							)}
							<div className="mt-3 flex gap-1">
								{service.status === "active" ? (
									<form
										action={async () => {
											"use server";
											await archiveService(service.id);
										}}
									>
										<button
											type="submit"
											className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-hover transition-colors"
										>
											<ArchiveIcon className="size-3" />
											Archive
										</button>
									</form>
								) : (
									<form
										action={async () => {
											"use server";
											await restoreService(service.id);
										}}
									>
										<button
											type="submit"
											className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-hover transition-colors"
										>
											<RotateCcwIcon className="size-3" />
											Restore
										</button>
									</form>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
