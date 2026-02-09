import Link from "next/link";
import {
	deliveryProjectStatusColors,
	deliveryProjectStatusLabels,
	normalizeProjectStatus,
} from "@/lib/agency/project-workflow";

type TransitionItem = {
	dbId: number;
	fromStatus: string;
	toStatus: string;
	reason: string | null;
	createdAt: Date;
	actorDisplayName: string | null;
	actorEmail: string | null;
	forced: boolean;
	source: string | null;
	qaGatePassed: boolean | null;
	qaFailureCount: number;
	qaTemplateType: string | null;
};

interface ProjectTransitionHistoryProps {
	items: TransitionItem[];
	projectId: string;
	filters: {
		source: string;
		forced: "all" | "true" | "false";
		startDate: string;
		endDate: string;
		pageSize: number;
	};
	pagination: {
		currentPage: number;
		totalPages: number;
		totalCount: number;
		pageSize: number;
	};
}

export function ProjectTransitionHistory({
	items,
	projectId,
	filters,
	pagination,
}: ProjectTransitionHistoryProps) {
	const today = new Date();
	const formatDate = (date: Date) => date.toISOString().slice(0, 10);
	const endDatePreset = formatDate(today);
	const sevenDaysAgo = new Date(today);
	sevenDaysAgo.setDate(today.getDate() - 7);
	const thirtyDaysAgo = new Date(today);
	thirtyDaysAgo.setDate(today.getDate() - 30);
	const startDate7d = formatDate(sevenDaysAgo);
	const startDate30d = formatDate(thirtyDaysAgo);
	const isClientSourceActive =
		filters.source === "client.portal.deliverables.review" &&
		filters.forced === "all" &&
		!filters.startDate &&
		!filters.endDate;
	const isForcedOnlyActive =
		filters.forced === "true" &&
		!filters.source &&
		!filters.startDate &&
		!filters.endDate;
	const isNonForcedOnlyActive =
		filters.forced === "false" &&
		!filters.source &&
		!filters.startDate &&
		!filters.endDate;
	const isLast7dActive =
		filters.startDate === startDate7d && filters.endDate === endDatePreset;
	const isLast30dActive =
		filters.startDate === startDate30d && filters.endDate === endDatePreset;
	const quickFilterClass = (active: boolean) =>
		`inline-flex items-center rounded-full border px-2 py-0.5 text-xs transition-colors ${
			active
				? "border-primary/50 bg-primary/10 text-primary"
				: "border-border text-text hover:bg-bg-hover"
		}`;

	const buildHref = (
		page: number,
		overrides?: Partial<{
			source: string;
			forced: "all" | "true" | "false";
			startDate: string;
			endDate: string;
			pageSize: number;
		}>,
	) => {
		const nextFilters = {
			source: overrides?.source ?? filters.source,
			forced: overrides?.forced ?? filters.forced,
			startDate: overrides?.startDate ?? filters.startDate,
			endDate: overrides?.endDate ?? filters.endDate,
			pageSize: overrides?.pageSize ?? filters.pageSize,
		};
		const params = new URLSearchParams();
		if (nextFilters.source) {
			params.set("source", nextFilters.source);
		}
		if (nextFilters.forced !== "all") {
			params.set("forced", nextFilters.forced);
		}
		if (nextFilters.startDate) {
			params.set("startDate", nextFilters.startDate);
		}
		if (nextFilters.endDate) {
			params.set("endDate", nextFilters.endDate);
		}
		params.set("pageSize", String(nextFilters.pageSize));
		params.set("page", String(page));
		return `/projects/${projectId}?${params.toString()}`;
	};

	return (
		<div className="rounded-xl border border-border bg-background p-4">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-sm font-medium text-text-muted">
					Status Transition History
				</h2>
				<span className="text-xs text-text-muted">
					{pagination.totalCount} total • {pagination.pageSize} per page
				</span>
			</div>
			<form method="get" className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-6">
				<input
					type="text"
					name="source"
					defaultValue={filters.source}
					placeholder="Source (exact)"
					className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-text placeholder:text-text-muted"
				/>
				<select
					name="forced"
					defaultValue={filters.forced}
					className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-text"
				>
					<option value="all">Forced: all</option>
					<option value="true">Forced only</option>
					<option value="false">Non-forced only</option>
				</select>
				<input
					type="date"
					name="startDate"
					defaultValue={filters.startDate}
					className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-text"
				/>
				<input
					type="date"
					name="endDate"
					defaultValue={filters.endDate}
					className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-text"
				/>
				<select
					name="pageSize"
					defaultValue={String(filters.pageSize)}
					className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-text"
				>
					<option value="10">10 / page</option>
					<option value="25">25 / page</option>
					<option value="50">50 / page</option>
				</select>
				<div className="flex items-center gap-2">
					<button
						type="submit"
						className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
					>
						Apply
					</button>
					<Link
						href={`/projects/${projectId}?pageSize=${filters.pageSize}`}
						className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs text-text hover:bg-bg-hover transition-colors"
					>
						Reset
					</Link>
				</div>
			</form>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<Link
					href={buildHref(1, {
						source: "client.portal.deliverables.review",
						forced: "all",
						startDate: "",
						endDate: "",
					})}
					className={quickFilterClass(isClientSourceActive)}
				>
					Client Review Source
				</Link>
				<Link
					href={buildHref(1, {
						source: "",
						forced: "true",
						startDate: "",
						endDate: "",
					})}
					className={quickFilterClass(isForcedOnlyActive)}
				>
					Forced Only
				</Link>
				<Link
					href={buildHref(1, {
						source: "",
						forced: "false",
						startDate: "",
						endDate: "",
					})}
					className={quickFilterClass(isNonForcedOnlyActive)}
				>
					Non-Forced Only
				</Link>
				<Link
					href={buildHref(1, {
						startDate: startDate7d,
						endDate: endDatePreset,
					})}
					className={quickFilterClass(isLast7dActive)}
				>
					Last 7d
				</Link>
				<Link
					href={buildHref(1, {
						startDate: startDate30d,
						endDate: endDatePreset,
					})}
					className={quickFilterClass(isLast30dActive)}
				>
					Last 30d
				</Link>
			</div>
			{items.length === 0 ? (
				<p className="text-sm text-text-muted">No transitions recorded yet.</p>
			) : (
				<div className="space-y-2">
					{items.map((item) => {
						const from = normalizeProjectStatus(item.fromStatus);
						const to = normalizeProjectStatus(item.toStatus);
						const actor =
							item.actorDisplayName ?? item.actorEmail ?? "Unknown user";

						return (
							<div
								key={item.dbId}
								className="rounded-lg border border-border/70 bg-bg-hover/30 p-3"
							>
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${deliveryProjectStatusColors[from]}`}
									>
										{deliveryProjectStatusLabels[from]}
									</span>
									<span className="text-text-muted">→</span>
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${deliveryProjectStatusColors[to]}`}
									>
										{deliveryProjectStatusLabels[to]}
									</span>
									{item.forced && (
										<span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-red-400 font-medium">
											Forced
										</span>
									)}
									{item.source === "client.portal.deliverables.review" && (
										<span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-400 font-medium">
											Client Review
										</span>
									)}
									{item.qaGatePassed === true && (
										<span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400 font-medium">
											QA Passed
										</span>
									)}
									{item.qaGatePassed === false && (
										<span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300 font-medium">
											QA Failed
											{item.qaFailureCount > 0
												? ` (${item.qaFailureCount})`
												: ""}
										</span>
									)}
									{item.qaTemplateType && (
										<span className="inline-flex items-center rounded-full bg-cyan-500/10 px-2 py-0.5 text-cyan-300 font-medium">
											DoD {item.qaTemplateType}
										</span>
									)}
								</div>
								<div className="mt-1 text-xs text-text-muted">
									{actor} • {new Date(item.createdAt).toLocaleString()}
								</div>
								{item.reason && (
									<p className="mt-2 text-sm text-text">{item.reason}</p>
								)}
							</div>
						);
					})}
				</div>
			)}
			<div className="mt-4 flex items-center justify-between text-xs text-text-muted">
				<span>
					Page {pagination.currentPage} of {pagination.totalPages}
				</span>
				<div className="flex items-center gap-2">
					{pagination.currentPage > 1 && (
						<Link
							href={buildHref(pagination.currentPage - 1)}
							className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors"
						>
							Previous
						</Link>
					)}
					{pagination.currentPage < pagination.totalPages && (
						<Link
							href={buildHref(pagination.currentPage + 1)}
							className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors"
						>
							Next
						</Link>
					)}
				</div>
			</div>
		</div>
	);
}
