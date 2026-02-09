import { and, eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	clientDigestSchedules,
	clients,
	db,
	projects,
	quotes,
	serviceSkus,
	sows,
} from "@/db";
import { toggleClientDigest } from "@/lib/agency/client-digest";
import { listClientInvitations } from "@/lib/agency/client-invitation";
import { fetchCurrentTeam } from "@/services/teams";
import { ClientEditForm } from "./client-edit-form";
import { createQuoteAndSow, setQuoteStatus } from "./commercial-actions";
import {
	inviteClientToPortal,
	resendClientInvitation,
	revokeClientInvitationAction,
} from "./invite-action";

export default async function ClientDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ clientId: string }>;
	searchParams: Promise<{
		invite?: string;
		commercial?: string;
		projectId?: string;
	}>;
}) {
	const { clientId } = await params;
	const query = await searchParams;
	const team = await fetchCurrentTeam();

	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.teamDbId, team.dbId)),
	});

	if (!client) {
		notFound();
	}

	const [clientProjects, activeSkus, commercialRows] = await Promise.all([
		db
			.select()
			.from(projects)
			.where(eq(projects.clientDbId, client.dbId))
			.orderBy(projects.updatedAt),
		db
			.select({
				dbId: serviceSkus.dbId,
				code: serviceSkus.code,
				name: serviceSkus.name,
				priceCents: serviceSkus.priceCents,
				currency: serviceSkus.currency,
			})
			.from(serviceSkus)
			.where(
				and(
					eq(serviceSkus.teamDbId, team.dbId),
					eq(serviceSkus.isActive, true),
				),
			),
		db
			.select({
				quoteId: quotes.id,
				quoteStatus: quotes.status,
				quoteTitle: quotes.title,
				scopeSnapshot: quotes.scopeSnapshot,
				priceCents: quotes.priceCents,
				currency: quotes.currency,
				acceptedAt: quotes.acceptedAt,
				rejectedAt: quotes.rejectedAt,
				projectId: projects.id,
				sowStatus: sows.status,
				skuCode: serviceSkus.code,
			})
			.from(quotes)
			.leftJoin(projects, eq(quotes.projectDbId, projects.dbId))
			.leftJoin(sows, eq(sows.quoteDbId, quotes.dbId))
			.leftJoin(serviceSkus, eq(serviceSkus.dbId, quotes.serviceSkuDbId))
			.where(
				and(eq(quotes.clientDbId, client.dbId), eq(quotes.teamDbId, team.dbId)),
			)
			.orderBy(quotes.createdAt),
	]);

	const hasPortalAccess = !!client.supabaseUserId;
	const [invitations, digestSchedule] = await Promise.all([
		listClientInvitations(client.dbId),
		db.query.clientDigestSchedules.findFirst({
			where: and(
				eq(clientDigestSchedules.teamDbId, team.dbId),
				eq(clientDigestSchedules.clientDbId, client.dbId),
			),
		}),
	]);
	const activeInvitation = invitations.find(
		(invitation) =>
			invitation.acceptedAt == null &&
			invitation.revokedAt == null &&
			invitation.expiredAt > new Date(),
	);
	const inviteAction = inviteClientToPortal.bind(null, clientId);
	const isDigestActive = digestSchedule?.isActive ?? false;
	const toggleDigestAction = toggleClientDigest.bind(
		null,
		client.dbId,
		team.dbId,
		!isDigestActive,
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link
					href="/clients"
					className="text-text-muted hover:text-text transition-colors"
				>
					<ArrowLeftIcon className="size-4" />
				</Link>
				<div className="flex-1">
					<h1 className="text-2xl font-bold text-text">{client.name}</h1>
					<p className="text-text-muted text-sm">
						{client.company ?? "No company"} &middot;{" "}
						{client.email ?? "No email"}
					</p>
				</div>
				<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize bg-primary/10 text-primary">
					{client.status}
				</span>
				{hasPortalAccess ? (
					<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-400">
						Portal Active
					</span>
				) : (
					client.email && (
						<form action={inviteAction}>
							<button
								type="submit"
								className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
							>
								Invite to Portal
							</button>
						</form>
					)
				)}
			</div>

			{query.invite && (
				<div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-text">
					{query.invite === "sent" && "Invitation sent to the client."}
					{query.invite === "resent" && "Invitation resent."}
					{query.invite === "revoked" && "Invitation revoked."}
					{query.invite === "already_invited" &&
						"An active invitation already exists."}
					{query.invite === "already_active" &&
						"Client already has portal access."}
					{query.invite === "missing_email" &&
						"Client must have an email address to receive an invitation."}
					{query.invite === "not_found" && "Invitation not found."}
					{query.invite === "error" &&
						"Something went wrong. Please try again."}
				</div>
			)}
			{query.commercial && (
				<div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-text">
					{query.commercial === "created" && "Quote and SOW created."}
					{query.commercial === "accepted" && (
						<>
							Quote accepted and project created.{" "}
							{query.projectId ? (
								<Link
									href={`/projects/${query.projectId}`}
									className="underline"
								>
									Open project
								</Link>
							) : null}
						</>
					)}
					{query.commercial === "rejected" && "Quote rejected."}
				</div>
			)}

			<ClientEditForm client={client} />

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<h2 className="text-sm font-medium text-text-muted">Portal Access</h2>
				{hasPortalAccess ? (
					<p className="text-sm text-text">
						This client already has access to the portal.
					</p>
				) : activeInvitation ? (
					<div className="space-y-2">
						<p className="text-sm text-text">
							Invitation sent to {activeInvitation.email}. Expires on{" "}
							{activeInvitation.expiredAt.toLocaleDateString()}.
						</p>
						<div className="flex gap-2">
							<form
								action={resendClientInvitation.bind(
									null,
									clientId,
									activeInvitation.token,
								)}
							>
								<button
									type="submit"
									className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-bg-hover transition-colors"
								>
									Resend
								</button>
							</form>
							<form
								action={revokeClientInvitationAction.bind(
									null,
									clientId,
									activeInvitation.token,
								)}
							>
								<button
									type="submit"
									className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-bg-hover transition-colors"
								>
									Revoke
								</button>
							</form>
						</div>
					</div>
				) : (
					<p className="text-sm text-text-muted">
						No active invitation. Send one to grant portal access.
					</p>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-4">
				<div>
					<h2 className="text-sm font-medium text-text-muted">
						Commercial Flow (Quote {"->"} SOW)
					</h2>
					<p className="text-xs text-text-muted mt-1">
						Create auditable commercial records and generate projects from
						accepted quotes.
					</p>
				</div>
				<form
					action={createQuoteAndSow.bind(null, clientId)}
					className="rounded-xl border border-border/70 bg-bg-hover/20 p-3 space-y-3"
				>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<input
							name="title"
							required
							placeholder="Quote title"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<select
							name="serviceSkuDbId"
							required
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							defaultValue=""
						>
							<option value="">Select service SKU...</option>
							{activeSkus.map((sku) => (
								<option key={sku.dbId} value={String(sku.dbId)}>
									{sku.code} - {sku.name} ({sku.currency.toUpperCase()}{" "}
									{(sku.priceCents / 100).toFixed(2)})
								</option>
							))}
						</select>
					</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<textarea
							name="notes"
							rows={2}
							placeholder="Commercial notes (optional)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
						/>
						<textarea
							name="terms"
							rows={2}
							placeholder="SOW terms (optional)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
						/>
					</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<input
							name="scopeOverrideReason"
							placeholder="Scope override reason (optional)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<select
							name="status"
							defaultValue="draft"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="draft">Draft</option>
							<option value="sent">Sent</option>
						</select>
					</div>
					<div className="flex justify-end">
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
						>
							Create Quote + SOW
						</button>
					</div>
				</form>
				<div className="space-y-2">
					{commercialRows.length === 0 ? (
						<p className="text-xs text-text-muted">
							No commercial records yet.
						</p>
					) : (
						commercialRows.map((row) => (
							<div
								key={row.quoteId}
								className="rounded-lg border border-border/70 bg-background p-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-sm font-medium text-text">
										{row.quoteTitle}
										<span className="ml-2 text-xs text-text-muted">
											{row.skuCode ? `(${row.skuCode})` : ""}
										</span>
									</p>
									<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary capitalize">
										{row.quoteStatus}
									</span>
								</div>
								<p className="text-xs text-text-muted mt-1 line-clamp-2">
									{row.scopeSnapshot}
								</p>
								<p className="text-xs text-text-muted mt-1">
									{row.currency.toUpperCase()}{" "}
									{(row.priceCents / 100).toFixed(2)} · SOW{" "}
									{row.sowStatus ?? "draft"}
								</p>
								<div className="mt-2 flex flex-wrap items-center gap-2">
									{row.projectId ? (
										<Link
											href={`/projects/${row.projectId}`}
											className="rounded-lg border border-border px-2.5 py-1 text-xs text-text hover:bg-bg-hover"
										>
											Open Project
										</Link>
									) : (
										<>
											<form action={setQuoteStatus.bind(null, clientId)}>
												<input
													type="hidden"
													name="quoteId"
													value={row.quoteId}
												/>
												<input type="hidden" name="action" value="accept" />
												<button
													type="submit"
													className="rounded-lg bg-primary px-2.5 py-1 text-xs text-white hover:bg-primary/90"
												>
													Accept + Create Project
												</button>
											</form>
											{row.quoteStatus !== "rejected" && (
												<form action={setQuoteStatus.bind(null, clientId)}>
													<input
														type="hidden"
														name="quoteId"
														value={row.quoteId}
													/>
													<input type="hidden" name="action" value="reject" />
													<button
														type="submit"
														className="rounded-lg border border-border px-2.5 py-1 text-xs text-text hover:bg-bg-hover"
													>
														Reject
													</button>
												</form>
											)}
										</>
									)}
								</div>
							</div>
						))
					)}
				</div>
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<h2 className="text-sm font-medium text-text-muted">Digest Settings</h2>
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm text-text">
							Weekly auto-update email:{" "}
							<span
								className={`font-medium ${isDigestActive ? "text-green-400" : "text-text-muted"}`}
							>
								{isDigestActive ? "Active" : "Inactive"}
							</span>
						</p>
						{digestSchedule?.lastSentAt && (
							<p className="text-xs text-text-muted mt-1">
								Last sent:{" "}
								{new Date(digestSchedule.lastSentAt).toLocaleDateString(
									"en-US",
									{
										month: "short",
										day: "numeric",
										year: "numeric",
									},
								)}
							</p>
						)}
					</div>
					<form action={toggleDigestAction}>
						<button
							type="submit"
							className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
								isDigestActive
									? "border border-border text-text hover:bg-bg-hover"
									: "bg-primary text-white hover:bg-primary/90"
							}`}
						>
							{isDigestActive ? "Disable" : "Enable"}
						</button>
					</form>
				</div>
			</div>

			<div>
				<h2 className="text-lg font-semibold text-text mb-3">Projects</h2>
				{clientProjects.length === 0 ? (
					<p className="text-text-muted text-sm">
						No projects for this client yet.
					</p>
				) : (
					<div className="grid gap-3">
						{clientProjects.map((project) => (
							<Link
								key={project.dbId}
								href={`/projects/${project.id}`}
								className="rounded-xl border border-border bg-background p-4 hover:bg-bg-hover transition-colors block"
							>
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium text-text">
										{project.name}
									</span>
									<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize bg-primary/10 text-primary">
										{project.status.replace("_", " ")}
									</span>
								</div>
								{project.brief && (
									<p className="text-xs text-text-muted mt-1 line-clamp-2">
										{project.brief}
									</p>
								)}
							</Link>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
