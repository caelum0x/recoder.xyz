import { eq } from "drizzle-orm";
import { ArrowLeftIcon, CheckIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	changeOrders,
	db,
	deliverables,
	invoices,
	milestoneApprovals,
	projects,
} from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { normalizeProjectStatus } from "@/lib/agency/project-workflow";
import { getCurrentUser } from "@/lib/get-current-user";
import { approveChangeOrder, rejectChangeOrderFromForm } from "./actions";
import { DeliverablesReviewPanel } from "./deliverables-review-panel";

const statusSteps = [
	"queued",
	"in_progress",
	"qa",
	"client_review",
	"done",
] as const;

export default async function ClientProjectDetailPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		notFound();
	}

	const project = await db.query.projects.findFirst({
		where: eq(projects.id, projectId),
	});

	if (!project || project.clientDbId !== client.dbId) {
		notFound();
	}

	const [
		projectDeliverables,
		projectInvoices,
		projectChangeOrders,
		projectMilestoneApprovals,
	] = await Promise.all([
		db
			.select()
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.dbId))
			.orderBy(deliverables.phaseOrder, deliverables.createdAt),
		db
			.select()
			.from(invoices)
			.where(eq(invoices.projectDbId, project.dbId))
			.orderBy(invoices.createdAt),
		db
			.select()
			.from(changeOrders)
			.where(eq(changeOrders.projectDbId, project.dbId))
			.orderBy(changeOrders.scopeVersion),
		db
			.select()
			.from(milestoneApprovals)
			.where(eq(milestoneApprovals.projectDbId, project.dbId)),
	]);

	const normalizedProjectStatus = normalizeProjectStatus(project.status);
	const timelineStatus =
		normalizedProjectStatus === "blocked"
			? "in_progress"
			: normalizedProjectStatus;
	const currentStep = statusSteps.indexOf(timelineStatus);

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link
					href="/portal/projects"
					className="text-text-muted hover:text-text transition-colors"
				>
					<ArrowLeftIcon className="size-4" />
				</Link>
				<h1 className="text-2xl font-bold text-text">{project.name}</h1>
			</div>

			{/* Status timeline */}
			<div className="flex items-center gap-2">
				{statusSteps.map((step, i) => (
					<div key={step} className="flex items-center gap-2">
						<div
							className={`flex items-center justify-center size-6 rounded-full text-xs font-medium ${
								i <= currentStep
									? "bg-primary text-white"
									: "bg-border text-text-muted"
							}`}
						>
							{i < currentStep ? <CheckIcon className="size-3.5" /> : i + 1}
						</div>
						<span
							className={`text-xs capitalize ${
								i <= currentStep ? "text-text" : "text-text-muted"
							}`}
						>
							{step.replace("_", " ")}
						</span>
						{i < statusSteps.length - 1 && (
							<div
								className={`w-8 h-px ${
									i < currentStep ? "bg-primary" : "bg-border"
								}`}
							/>
						)}
					</div>
				))}
			</div>

			{project.brief && (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-2">
						Project Brief
					</h2>
					<p className="text-sm text-text whitespace-pre-wrap">
						{project.brief}
					</p>
				</div>
			)}

			<DeliverablesReviewPanel
				projectId={project.id}
				initialDeliverables={projectDeliverables.map((d) => ({
					dbId: d.dbId,
					id: d.id,
					name: d.name,
					content: d.content,
					status: d.status,
					clientFeedback: d.clientFeedback,
					milestoneLabel: d.milestoneLabel,
					milestoneApprovalStatus: d.milestoneApprovalStatus,
					phaseOrder: d.phaseOrder,
				}))}
				milestoneApprovals={projectMilestoneApprovals.map((ma) => ({
					milestoneLabel: ma.milestoneLabel,
					status: ma.status,
				}))}
			/>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Change Orders
				</h2>
				{projectChangeOrders.length === 0 ? (
					<p className="text-sm text-text-muted">
						No change orders for this project.
					</p>
				) : (
					<div className="space-y-3">
						{projectChangeOrders.map((co) => (
							<div
								key={co.id}
								className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-sm font-medium text-text">
										{co.title}{" "}
										<span className="text-xs text-text-muted">
											v{co.scopeVersion}
										</span>
									</p>
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
											co.status === "approved"
												? "bg-emerald-500/10 text-emerald-400"
												: co.status === "rejected"
													? "bg-red-500/10 text-red-400"
													: "bg-amber-500/10 text-amber-300"
										}`}
									>
										{co.status}
									</span>
								</div>
								<p className="mt-1 text-xs text-text-muted whitespace-pre-wrap">
									{co.scopeDelta}
								</p>
								<p className="mt-1 text-xs text-text-muted">
									Billing delta:{" "}
									{new Intl.NumberFormat("en-US", {
										style: "currency",
										currency: "USD",
									}).format((co.billingDeltaCents ?? 0) / 100)}
								</p>
								{co.status === "pending" && (
									<div className="mt-2 flex flex-wrap items-center gap-2">
										<form action={approveChangeOrder.bind(null, co.id)}>
											<button
												type="submit"
												className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
											>
												Approve
											</button>
										</form>
										<form
											action={rejectChangeOrderFromForm.bind(null, co.id)}
											className="flex items-center gap-2"
										>
											<input
												name="reason"
												required
												placeholder="Reason for rejection"
												className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-text"
											/>
											<button
												type="submit"
												className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-bg-hover"
											>
												Reject
											</button>
										</form>
									</div>
								)}
								{co.status !== "pending" && co.decisionReason && (
									<p className="mt-2 text-xs text-text-muted">
										Decision note: {co.decisionReason}
									</p>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			{/* Invoices */}
			{projectInvoices.length > 0 && (
				<div>
					<h2 className="text-lg font-semibold text-text mb-3">Invoices</h2>
					<div className="grid gap-3">
						{projectInvoices.map((inv) => (
							<div
								key={inv.dbId}
								className="rounded-xl border border-border bg-background p-4 flex items-center justify-between"
							>
								<div>
									<span className="text-sm font-medium text-text">
										{new Intl.NumberFormat("en-US", {
											style: "currency",
											currency: inv.currency.toUpperCase(),
										}).format(inv.amount / 100)}
									</span>
									{inv.dueDate && (
										<span className="text-xs text-text-muted ml-3">
											Due{" "}
											{new Date(inv.dueDate).toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}
										</span>
									)}
								</div>
								<div className="flex items-center gap-3">
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
											inv.status === "paid"
												? "bg-green-100 text-green-700"
												: inv.status === "overdue"
													? "bg-red-100 text-red-700"
													: inv.status === "sent"
														? "bg-blue-100 text-blue-700"
														: "bg-gray-100 text-gray-700"
										}`}
									>
										{inv.status}
									</span>
									{inv.stripeInvoiceId && inv.status === "sent" && (
										<a
											href={`https://invoice.stripe.com/i/${inv.stripeInvoiceId}`}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
										>
											<ExternalLinkIcon className="size-3" />
											Pay Now
										</a>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
