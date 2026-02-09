import { eq, sql } from "drizzle-orm";
import { costLedgerEntries, db, projects } from "@/db";

export type ProjectCostGuardrailSnapshot = {
	budgetCents: number | null;
	totalSpentCents: number;
	percentUsed: number | null;
	warningThresholdPct: number;
	hardStopThresholdPct: number;
	hardStopEnabled: boolean;
	warningBreached: boolean;
	hardStopBreached: boolean;
};

export async function getProjectCostGuardrailSnapshot(
	projectDbId: number,
): Promise<ProjectCostGuardrailSnapshot | null> {
	const project = await db.query.projects.findFirst({
		where: eq(projects.dbId, projectDbId),
	});
	if (!project) {
		return null;
	}

	const [spentRow] = await db
		.select({
			total: sql<number>`coalesce(sum(${costLedgerEntries.amountCents}), 0)`,
		})
		.from(costLedgerEntries)
		.where(eq(costLedgerEntries.projectDbId, projectDbId));

	const totalSpentCents = Number(spentRow?.total ?? 0);
	const budgetCents = project.budgetCents;
	const percentUsed =
		budgetCents !== null && budgetCents > 0
			? (totalSpentCents / budgetCents) * 100
			: null;
	const warningThresholdPct = project.costWarningThresholdPct;
	const hardStopThresholdPct = project.costHardStopThresholdPct;
	const warningBreached =
		percentUsed !== null ? percentUsed >= warningThresholdPct : false;
	const hardStopBreached =
		percentUsed !== null ? percentUsed >= hardStopThresholdPct : false;

	return {
		budgetCents,
		totalSpentCents,
		percentUsed,
		warningThresholdPct,
		hardStopThresholdPct,
		hardStopEnabled: project.costHardStopEnabled,
		warningBreached,
		hardStopBreached,
	};
}
