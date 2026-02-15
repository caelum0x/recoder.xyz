import { NextResponse } from "next/server";
import {
	type AiStudioUseCaseId,
	RECODER_AI_STUDIO_USE_CASES,
} from "@recoder/ecosystem-config";
import { z } from "zod";
import { fetchCurrentUser } from "@/services/accounts";
import { fetchCurrentTeam } from "@/services/teams";
import { isKnownUseCaseId } from "@/lib/use-cases/evaluate-readiness";
import { simulateUseCaseForTeam } from "@/lib/use-cases/simulation";
import {
	buildDeploymentDiff,
	type DeploymentStage,
	getUseCaseDeploymentSnapshot,
	updateUseCaseDeploymentStage,
} from "@/lib/use-cases/deployment";

const deployActionSchema = z.object({
	useCaseId: z.string().min(1),
	action: z.enum([
		"create_draft",
		"promote_canary",
		"promote_live",
		"rollback",
	]),
	reason: z.string().min(1).max(300).optional(),
	workspaceId: z.string().min(1).optional(),
	canaryPolicy: z
		.object({
			rolloutPercentage: z.number().int().min(1).max(100),
			audience: z.enum(["all", "internal", "beta"]),
		})
		.optional(),
});

function resolveStage(action: z.infer<typeof deployActionSchema>["action"]): DeploymentStage {
	if (action === "create_draft" || action === "rollback") return "draft";
	if (action === "promote_canary") return "canary";
	return "live";
}

function defaultReason(action: z.infer<typeof deployActionSchema>["action"]) {
	if (action === "create_draft") return "Create or reset deployment draft";
	if (action === "promote_canary") return "Promote workflow to canary";
	if (action === "promote_live") return "Promote workflow to live";
	return "Rollback from deployment stage";
}

export async function GET(request: Request) {
	const useCaseIdQuery = new URL(request.url).searchParams.get("useCaseId");
	if (useCaseIdQuery && !isKnownUseCaseId(useCaseIdQuery)) {
		return NextResponse.json({ error: "Unknown useCaseId." }, { status: 404 });
	}

	const team = await fetchCurrentTeam();
	if (useCaseIdQuery) {
		const snapshot = await getUseCaseDeploymentSnapshot({
			teamDbId: team.dbId,
			useCaseId: useCaseIdQuery as AiStudioUseCaseId,
		});
		return NextResponse.json({
			deployment: snapshot,
			diff: buildDeploymentDiff(snapshot.history),
		});
	}

	const deployments = await Promise.all(
		RECODER_AI_STUDIO_USE_CASES.map((useCase) =>
			getUseCaseDeploymentSnapshot({
				teamDbId: team.dbId,
				useCaseId: useCase.id,
			}),
		),
	);
	return NextResponse.json({
		deployments: deployments.map((deployment) => ({
			...deployment,
			diff: buildDeploymentDiff(deployment.history),
		})),
	});
}

export async function POST(request: Request) {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid JSON body. Expected useCaseId and action." },
			{ status: 400 },
		);
	}

	const parsed = deployActionSchema.safeParse(payload);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request body. Expected useCaseId and action." },
			{ status: 400 },
		);
	}
	if (!isKnownUseCaseId(parsed.data.useCaseId)) {
		return NextResponse.json({ error: "Unknown useCaseId." }, { status: 404 });
	}

	const [team, user] = await Promise.all([fetchCurrentTeam(), fetchCurrentUser()]);

	try {
		if (parsed.data.action === "promote_live") {
			const simulation = await simulateUseCaseForTeam({
				teamDbId: team.dbId,
				useCaseId: parsed.data.useCaseId,
			});
			if (simulation.status !== "pass") {
				return NextResponse.json(
					{
						error:
							"Simulation must pass before promoting to live. Resolve blockers and retry.",
						simulation,
					},
					{ status: 409 },
				);
			}
		}

		const deployment = await updateUseCaseDeploymentStage({
			teamDbId: team.dbId,
			useCaseId: parsed.data.useCaseId,
			nextStage: resolveStage(parsed.data.action),
			actorUserId: user.id,
			reason: parsed.data.reason ?? defaultReason(parsed.data.action),
			workspaceId: parsed.data.workspaceId,
			canaryPolicy: parsed.data.canaryPolicy,
		});
		return NextResponse.json({
			deployment,
			diff: buildDeploymentDiff(deployment.history),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to update deployment";
		return NextResponse.json({ error: message }, { status: 409 });
	}
}
