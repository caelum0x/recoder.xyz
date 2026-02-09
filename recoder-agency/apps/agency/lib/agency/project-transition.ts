import { and, eq, sql } from "drizzle-orm";
import {
	costLedgerEntries,
	type db,
	type ProjectStatus,
	projectStatusTransitions,
	projects,
} from "@/db";
import {
	normalizeProjectStatus,
	validateProjectStatusTransition,
} from "@/lib/agency/project-workflow";

type TransitionMetadata = Record<string, unknown>;
type TransitionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ApplyProjectTransitionInput = {
	projectDbId: number;
	fromStatus: ProjectStatus;
	toStatus: ProjectStatus;
	actorUserDbId: number | null;
	reason?: string | null;
	source: string;
	force?: boolean;
	metadata?: TransitionMetadata;
};

export type ApplyProjectTransitionResult = {
	applied: boolean;
	fromStatus: ProjectStatus;
	toStatus: ProjectStatus;
	validationMessage: string | null;
};

export async function applyProjectTransitionWithAudit(
	tx: TransitionTx,
	{
		projectDbId,
		fromStatus: fromStatusInput,
		toStatus: toStatusInput,
		actorUserDbId,
		reason,
		source,
		force = false,
		metadata,
	}: ApplyProjectTransitionInput,
): Promise<ApplyProjectTransitionResult> {
	await tx.execute(sql`set local app.allow_project_status_update = 'on'`);

	const fromStatus = normalizeProjectStatus(fromStatusInput);
	const toStatus = normalizeProjectStatus(toStatusInput);
	if (fromStatus === toStatus) {
		return {
			applied: false,
			fromStatus,
			toStatus,
			validationMessage: "No-op transition ignored.",
		};
	}

	const validation = validateProjectStatusTransition(fromStatus, toStatus);
	if (!validation.valid && !force) {
		throw new Error(validation.message ?? "Invalid project status transition.");
	}

	const updated = await tx
		.update(projects)
		.set({ status: toStatus })
		.where(and(eq(projects.dbId, projectDbId), eq(projects.status, fromStatus)))
		.returning({ dbId: projects.dbId });

	if (updated.length === 0) {
		return {
			applied: false,
			fromStatus,
			toStatus,
			validationMessage:
				"Transition skipped because project status already changed.",
		};
	}

	const [project, costRow] = await Promise.all([
		tx.query.projects.findFirst({
			where: eq(projects.dbId, projectDbId),
		}),
		tx
			.select({
				total: sql<number>`coalesce(sum(${costLedgerEntries.amountCents}), 0)`,
			})
			.from(costLedgerEntries)
			.where(eq(costLedgerEntries.projectDbId, projectDbId)),
	]);
	const costTotal = Number(costRow[0]?.total ?? 0);
	const budgetCents = project?.budgetCents ?? null;
	const warningThresholdPct = project?.costWarningThresholdPct ?? 80;
	const hardStopThresholdPct = project?.costHardStopThresholdPct ?? 100;
	const hardStopEnabled = project?.costHardStopEnabled ?? false;
	const percentUsed =
		budgetCents !== null && budgetCents > 0
			? (costTotal / budgetCents) * 100
			: null;
	const costGuardrailMetadata = {
		budgetCents,
		totalSpentCents: costTotal,
		percentUsed,
		warningThresholdPct,
		hardStopThresholdPct,
		hardStopEnabled,
		warningBreached:
			percentUsed !== null ? percentUsed >= warningThresholdPct : false,
		hardStopBreached:
			percentUsed !== null ? percentUsed >= hardStopThresholdPct : false,
	};

	await tx.insert(projectStatusTransitions).values({
		projectDbId,
		fromStatus,
		toStatus,
		actorUserDbId,
		reason: reason?.trim() || null,
		metadata: {
			source,
			...(metadata ?? {}),
			costGuardrail: costGuardrailMetadata,
			validationMessage: validation.message ?? null,
		},
	});

	return {
		applied: true,
		fromStatus,
		toStatus,
		validationMessage: validation.message ?? null,
	};
}
