"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { changeOrders, db, projects, quotes } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { requireAdminRole } from "@/services/teams";

export async function createChangeOrder(projectId: string, formData: FormData) {
	const [team, user] = await Promise.all([
		requireAdminRole(),
		getCurrentUser(),
	]);
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found.");
	}

	const title = String(formData.get("title") ?? "").trim();
	const scopeDelta = String(formData.get("scopeDelta") ?? "").trim();
	const billingDeltaRaw = Number.parseInt(
		String(formData.get("billingDeltaCents") ?? "0"),
		10,
	);

	if (!title) {
		throw new Error("Change order title is required.");
	}
	if (!scopeDelta) {
		throw new Error("Scope delta is required.");
	}
	if (Number.isNaN(billingDeltaRaw)) {
		throw new Error("Billing delta must be a valid integer.");
	}

	const latest = await db.query.changeOrders.findFirst({
		where: eq(changeOrders.projectDbId, project.dbId),
		orderBy: desc(changeOrders.scopeVersion),
	});
	const nextVersion = (latest?.scopeVersion ?? 0) + 1;

	let quoteDbId: number | null = project.quoteDbId ?? null;
	if (quoteDbId == null) {
		const linkedQuote = await db.query.quotes.findFirst({
			where: eq(quotes.projectDbId, project.dbId),
		});
		quoteDbId = linkedQuote?.dbId ?? null;
	}

	await db.insert(changeOrders).values({
		id: `co_${crypto.randomUUID()}`,
		teamDbId: team.dbId,
		projectDbId: project.dbId,
		clientDbId: project.clientDbId,
		quoteDbId,
		title,
		scopeDelta,
		billingDeltaCents: billingDeltaRaw,
		scopeVersion: nextVersion,
		status: "pending",
		requestedByUserDbId: user.dbId,
	});

	revalidatePath(`/projects/${projectId}`);
	revalidatePath(`/portal/projects/${projectId}`);
}
