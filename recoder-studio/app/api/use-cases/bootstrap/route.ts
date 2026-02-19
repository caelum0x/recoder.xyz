import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	RECODER_AI_STUDIO_USE_CASES,
	resolveWorkflowRequiredSources,
} from "@recoder/ecosystem-config";
import { createTeamWorkspace } from "@/app/api/_lib/create-team-workspace";
import { db, workspaces } from "@/db";
import type { WorkspaceMetadata } from "@/db/schema";
import { applyUseCaseStarterTemplate } from "@/lib/use-cases/bootstrap-template";
import {
	evaluateUseCaseReadinessForTeamUseCase,
	isKnownUseCaseId,
} from "@/lib/use-cases/evaluate-readiness";
import { fetchCurrentUser } from "@/services/accounts";
import { fetchCurrentTeam } from "@/services/teams";

const bootstrapUseCaseSchema = z.object({
	useCaseId: z.string().min(1),
});

export async function POST(request: Request) {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid JSON body. Expected useCaseId." },
			{ status: 400 },
		);
	}
	const parsed = bootstrapUseCaseSchema.safeParse(payload);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request body. Expected useCaseId." },
			{ status: 400 },
		);
	}

	if (!isKnownUseCaseId(parsed.data.useCaseId)) {
		return NextResponse.json({ error: "Unknown useCaseId." }, { status: 404 });
	}

	const useCase = RECODER_AI_STUDIO_USE_CASES.find(
		(item) => item.id === parsed.data.useCaseId,
	);
	if (!useCase) {
		return NextResponse.json({ error: "Unknown useCaseId." }, { status: 404 });
	}
	const [team, user] = await Promise.all([fetchCurrentTeam(), fetchCurrentUser()]);
	const readiness = await evaluateUseCaseReadinessForTeamUseCase(
		team.dbId,
		useCase.id,
	);
	if (readiness.status === "setup_required") {
		return NextResponse.json(
			{
				error: readiness.message,
				readiness,
			},
			{ status: 409 },
		);
	}

	const workspaceName = `${useCase.title} Workspace`;
	const nowIso = new Date().toISOString();
	const { redirectPath, workspaceId } = await createTeamWorkspace({
		name: workspaceName,
		metadata: {
			sample: false,
			starterTemplate: {
				useCaseId: useCase.id,
				starterPrompt: useCase.starterPrompt,
				createdAt: nowIso,
				workflowBlueprint: {
					objective: useCase.workflowBlueprint.objective,
					requiredSources: [...resolveWorkflowRequiredSources(useCase.workflowBlueprint)],
					sourceNodes: [...resolveWorkflowRequiredSources(useCase.workflowBlueprint)],
					simulationChecks: [...useCase.workflowBlueprint.simulationChecks],
					deployChecklist: [...useCase.workflowBlueprint.deployChecklist],
					successCriteria: [...useCase.workflowBlueprint.successCriteria],
				},
				deployment: {
					stage: "draft",
					canaryPolicy: {
						rolloutPercentage: 10,
						audience: "beta",
					},
					updatedAt: nowIso,
					history: [
						{
							fromStage: null,
							toStage: "draft",
							reason: "Initial workspace bootstrap",
							changedAt: nowIso,
							actorUserId: user.id,
							snapshot: {
								workspaceId: "pending",
								workspaceName,
								workspaceUpdatedAt: nowIso,
								nodeCount: 0,
								nodeTypeCounts: {},
								modelIds: [],
								requiredSources: [...resolveWorkflowRequiredSources(useCase.workflowBlueprint)],
								sourceNodes: [...resolveWorkflowRequiredSources(useCase.workflowBlueprint)],
								objective: useCase.workflowBlueprint.objective,
								canaryPolicy: {
									rolloutPercentage: 10,
									audience: "beta",
								},
							},
						},
					],
				},
			},
		},
	});

	try {
		const workspace = await db.query.workspaces.findFirst({
			where: and(eq(workspaces.id, workspaceId), eq(workspaces.teamDbId, team.dbId)),
		});
		if (workspace?.metadata?.starterTemplate?.deployment?.history?.[0]?.snapshot) {
			const metadata = structuredClone(workspace.metadata) as WorkspaceMetadata;
			const firstHistoryEntry = metadata.starterTemplate?.deployment?.history?.[0];
			if (firstHistoryEntry?.snapshot) {
				firstHistoryEntry.snapshot.workspaceId = workspaceId;
				firstHistoryEntry.snapshot.workspaceUpdatedAt =
					workspace.updatedAt.toISOString();
			}
			await db
				.update(workspaces)
				.set({
					metadata,
					updatedAt: new Date(),
				})
				.where(
					and(eq(workspaces.id, workspaceId), eq(workspaces.teamDbId, team.dbId)),
				);
		}
	} catch (error) {
		console.error("Failed to backfill bootstrap deployment snapshot workspace ID:", error);
	}

	let starterTemplateApplied = true;
	try {
		await applyUseCaseStarterTemplate({
			workspaceId,
			useCase,
		});
	} catch (error) {
		starterTemplateApplied = false;
		console.error("Failed to apply starter template nodes:", error);
	}
	const query = new URLSearchParams({
		useCaseId: useCase.id,
		entry: useCase.studioPath,
	});

	return NextResponse.json(
		{
			redirectPath: `${redirectPath}?${query.toString()}`,
			workspaceId,
			useCaseId: useCase.id,
			starterPrompt: useCase.starterPrompt,
			starterTemplateApplied,
		},
		{ status: 201 },
	);
}
