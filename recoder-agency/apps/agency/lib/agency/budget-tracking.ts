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
	let project: Awaited<ReturnType<typeof db.query.projects.findFirst>>;
	try {
		project = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, projectDbId),
				eq(projects.teamDbId, teamDbId),
			),
		});
	} catch {
		return null;
	}

	if (!project) return null;

	let entries: Array<{ amountCents: number; category: string }>;
	try {
		entries = await db
			.select({
				amountCents: costLedgerEntries.amountCents,
				category: costLedgerEntries.category,
			})
			.from(costLedgerEntries)
			.where(eq(costLedgerEntries.projectDbId, projectDbId));
	} catch {
		// cost_ledger_entries table may not exist yet
		entries = [];
	}

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
	const empty: TeamBudgetOverview = {
		totalBudgetCents: 0,
		totalSpentCents: 0,
		projectCount: 0,
		overBudgetCount: 0,
		projects: [],
	};

	let teamProjects: Array<{
		dbId: number;
		id: string;
		name: string;
		budgetCents: number | null;
		status: string;
		clientName: string | null;
	}>;
	try {
		teamProjects = await db
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
	} catch {
		return empty;
	}

	let spentByProject: Array<{ projectDbId: number; total: number }>;
	try {
		spentByProject = await db
			.select({
				projectDbId: costLedgerEntries.projectDbId,
				total: sql<number>`coalesce(sum(${costLedgerEntries.amountCents}), 0)`,
			})
			.from(costLedgerEntries)
			.where(eq(costLedgerEntries.teamDbId, teamDbId))
			.groupBy(costLedgerEntries.projectDbId);
	} catch {
		// cost_ledger_entries table may not exist yet
		spentByProject = [];
	}

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
