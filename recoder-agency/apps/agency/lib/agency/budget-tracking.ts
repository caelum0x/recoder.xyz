import { and, eq, sql } from "drizzle-orm";
import { clients, costLedgerEntries, db, projects } from "@/db";

export interface ProjectBudgetSummary {
	projectDbId: number;
	projectId: string;
	projectName: string;
	budgetCents: number | null;
	totalSpentCents: number;
	remainingCents: number | null;
	percentUsed: number | null;
	isOverBudget: boolean;
	entriesByCategory: Record<string, number>;
}

export async function getProjectBudgetSummary(
	teamDbId: number,
	projectDbId: number,
): Promise<ProjectBudgetSummary | null> {
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.dbId, projectDbId), eq(projects.teamDbId, teamDbId)),
	});

	if (!project) return null;

	const entries = await db
		.select()
		.from(costLedgerEntries)
		.where(eq(costLedgerEntries.projectDbId, projectDbId));

	const totalSpentCents = entries.reduce((sum, e) => sum + e.amountCents, 0);

	const entriesByCategory: Record<string, number> = {};
	for (const entry of entries) {
		entriesByCategory[entry.category] =
			(entriesByCategory[entry.category] ?? 0) + entry.amountCents;
	}

	const budgetCents = project.budgetCents;
	const remainingCents =
		budgetCents !== null ? budgetCents - totalSpentCents : null;
	const percentUsed =
		budgetCents !== null && budgetCents > 0
			? (totalSpentCents / budgetCents) * 100
			: null;
	const isOverBudget = remainingCents !== null && remainingCents < 0;

	return {
		projectDbId: project.dbId,
		projectId: project.id,
		projectName: project.name,
		budgetCents,
		totalSpentCents,
		remainingCents,
		percentUsed,
		isOverBudget,
		entriesByCategory,
	};
}

export interface TeamBudgetOverview {
	totalBudgetCents: number;
	totalSpentCents: number;
	projectCount: number;
	overBudgetCount: number;
	projects: Array<{
		projectId: string;
		projectName: string;
		clientName: string | null;
		budgetCents: number | null;
		spentCents: number;
		status: string;
	}>;
}

export async function getTeamBudgetOverview(
	teamDbId: number,
): Promise<TeamBudgetOverview> {
	const teamProjects = await db
		.select({
			dbId: projects.dbId,
			id: projects.id,
			name: projects.name,
			budgetCents: projects.budgetCents,
			status: projects.status,
			clientName: clients.name,
		})
		.from(projects)
		.leftJoin(clients, eq(projects.clientDbId, clients.dbId))
		.where(eq(projects.teamDbId, teamDbId));

	const spentByProject = await db
		.select({
			projectDbId: costLedgerEntries.projectDbId,
			total: sql<number>`coalesce(sum(${costLedgerEntries.amountCents}), 0)`,
		})
		.from(costLedgerEntries)
		.where(eq(costLedgerEntries.teamDbId, teamDbId))
		.groupBy(costLedgerEntries.projectDbId);

	const spentMap = new Map(
		spentByProject.map((s) => [s.projectDbId, Number(s.total)]),
	);

	let totalBudgetCents = 0;
	let totalSpentCents = 0;
	let overBudgetCount = 0;

	const projectSummaries = teamProjects.map((p) => {
		const spent = spentMap.get(p.dbId) ?? 0;
		totalSpentCents += spent;
		if (p.budgetCents !== null) {
			totalBudgetCents += p.budgetCents;
			if (spent > p.budgetCents) {
				overBudgetCount++;
			}
		}
		return {
			projectId: p.id,
			projectName: p.name,
			clientName: p.clientName,
			budgetCents: p.budgetCents,
			spentCents: spent,
			status: p.status,
		};
	});

	return {
		totalBudgetCents,
		totalSpentCents,
		projectCount: teamProjects.length,
		overBudgetCount,
		projects: projectSummaries,
	};
}
