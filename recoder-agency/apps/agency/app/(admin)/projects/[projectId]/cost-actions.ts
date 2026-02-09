"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { CostCategory } from "@/db";
import { costLedgerEntries, db, projects } from "@/db";
import { requireAdminRole } from "@/services/teams";

export async function addCostEntry(formData: FormData) {
	const team = await requireAdminRole();
	const projectId = formData.get("projectId") as string;
	const description = (formData.get("description") as string)?.trim();
	const amountStr = formData.get("amount") as string;
	const category = (formData.get("category") as string) || "other";
	const occurredAtStr = formData.get("occurredAt") as string;

	if (!description) {
		throw new Error("Description is required");
	}

	const amountCents = Math.round(Number.parseFloat(amountStr) * 100);
	if (Number.isNaN(amountCents) || amountCents <= 0) {
		throw new Error("Amount must be positive");
	}

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});

	if (!project) {
		throw new Error("Project not found");
	}

	if (project.budgetCents !== null && project.budgetCents > 0) {
		const [spentRow] = await db
			.select({
				total: sql<number>`coalesce(sum(${costLedgerEntries.amountCents}), 0)`,
			})
			.from(costLedgerEntries)
			.where(eq(costLedgerEntries.projectDbId, project.dbId));
		const totalSpentCents = Number(spentRow?.total ?? 0);
		const projectedSpentCents = totalSpentCents + amountCents;
		const projectedPct = (projectedSpentCents / project.budgetCents) * 100;
		if (
			project.costHardStopEnabled &&
			projectedPct >= project.costHardStopThresholdPct
		) {
			throw new Error(
				`Cost hard-stop triggered at ${project.costHardStopThresholdPct}% of budget. Projected usage ${projectedPct.toFixed(1)}%.`,
			);
		}
	}

	await db.insert(costLedgerEntries).values({
		id: crypto.randomUUID(),
		teamDbId: team.dbId,
		projectDbId: project.dbId,
		description,
		amountCents,
		category: category as CostCategory,
		occurredAt: occurredAtStr ? new Date(occurredAtStr) : new Date(),
	});

	revalidatePath(`/projects/${projectId}`);
}

export async function deleteCostEntry(entryId: string, projectId: string) {
	const team = await requireAdminRole();

	await db
		.delete(costLedgerEntries)
		.where(
			and(
				eq(costLedgerEntries.id, entryId),
				eq(costLedgerEntries.teamDbId, team.dbId),
			),
		);

	revalidatePath(`/projects/${projectId}`);
}

export async function updateProjectBudget(formData: FormData) {
	const team = await requireAdminRole();
	const projectId = formData.get("projectId") as string;
	const budgetStr = formData.get("budget") as string;
	const warningThresholdStr = formData.get("warningThresholdPct") as string;
	const hardStopThresholdStr = formData.get("hardStopThresholdPct") as string;
	const hardStopEnabled = formData.get("hardStopEnabled") === "1";

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});

	if (!project) {
		throw new Error("Project not found");
	}

	const budgetCents = budgetStr
		? Math.round(Number.parseFloat(budgetStr) * 100)
		: null;

	if (budgetCents !== null && (Number.isNaN(budgetCents) || budgetCents < 0)) {
		throw new Error("Invalid budget amount");
	}

	const warningThresholdPct = Number.parseInt(warningThresholdStr || "80", 10);
	const hardStopThresholdPct = Number.parseInt(
		hardStopThresholdStr || "100",
		10,
	);
	if (
		Number.isNaN(warningThresholdPct) ||
		warningThresholdPct < 1 ||
		warningThresholdPct > 500
	) {
		throw new Error("Warning threshold must be between 1 and 500.");
	}
	if (
		Number.isNaN(hardStopThresholdPct) ||
		hardStopThresholdPct < 1 ||
		hardStopThresholdPct > 500
	) {
		throw new Error("Hard-stop threshold must be between 1 and 500.");
	}

	await db
		.update(projects)
		.set({
			budgetCents,
			costWarningThresholdPct: warningThresholdPct,
			costHardStopThresholdPct: hardStopThresholdPct,
			costHardStopEnabled: hardStopEnabled,
		})
		.where(eq(projects.id, projectId));

	revalidatePath(`/projects/${projectId}`);
}
