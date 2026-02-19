import { and, desc, eq } from "drizzle-orm";
import type { AiStudioUseCaseId } from "@recoder/ecosystem-config";
import { giselle } from "@/app/giselle";
import { db, workspaces } from "@/db";
import type { WorkspaceMetadata } from "@/db/schema";

export type DeploymentStage = "draft" | "canary" | "live";
export type CanaryAudience = "all" | "internal" | "beta";

export interface CanaryPolicy {
	rolloutPercentage: number;
	audience: CanaryAudience;
}

export interface DeploymentHistorySnapshot {
	workspaceId: string;
	workspaceName: string;
	workspaceUpdatedAt: string;
	nodeCount: number;
	nodeTypeCounts: Record<string, number>;
	modelIds: string[];
	requiredSources?: string[];
	sourceNodes: string[];
	objective: string;
	canaryPolicy?: CanaryPolicy;
}

export interface DeploymentHistoryEvent {
	fromStage: DeploymentStage | null;
	toStage: DeploymentStage;
	reason: string;
	changedAt: string;
	actorUserId: string;
	snapshot?: DeploymentHistorySnapshot;
}

export interface UseCaseDeploymentSnapshot {
	useCaseId: AiStudioUseCaseId;
	stage: DeploymentStage;
	canaryPolicy: CanaryPolicy;
	updatedAt: string;
	workspaceId: string | null;
	history: DeploymentHistoryEvent[];
}

export interface UseCaseDeploymentDiff {
	fromChangedAt: string;
	toChangedAt: string;
	changes: string[];
}

const DEFAULT_STAGE: DeploymentStage = "draft";
const DEFAULT_CANARY_POLICY: CanaryPolicy = {
	rolloutPercentage: 10,
	audience: "beta",
};

function normalizeCanaryAudience(audience: unknown): CanaryAudience {
	if (audience === "all" || audience === "internal" || audience === "beta") {
		return audience;
	}
	return DEFAULT_CANARY_POLICY.audience;
}

function normalizeCanaryPolicy(policy: Partial<CanaryPolicy> | undefined): CanaryPolicy {
	return {
		rolloutPercentage: Math.min(
			100,
			Math.max(1, Number(policy?.rolloutPercentage ?? DEFAULT_CANARY_POLICY.rolloutPercentage)),
		),
		audience: normalizeCanaryAudience(policy?.audience),
	};
}

function parseDeploymentFromMetadata(
	metadata: WorkspaceMetadata,
): Omit<UseCaseDeploymentSnapshot, "useCaseId"> | null {
	const deployment = metadata.starterTemplate?.deployment;
	if (!deployment) {
		return null;
	}

	return {
		stage: deployment.stage ?? DEFAULT_STAGE,
		canaryPolicy: normalizeCanaryPolicy(deployment.canaryPolicy),
		updatedAt: deployment.updatedAt ?? new Date(0).toISOString(),
		history: Array.isArray(deployment.history) ? deployment.history : [],
		workspaceId: null,
	};
}

async function findLatestUseCaseWorkspace(args: {
	teamDbId: number;
	useCaseId: AiStudioUseCaseId;
	workspaceId?: string | null;
}) {
	const teamWorkspaces = await db.query.workspaces.findMany({
		where: (workspaceTable, { eq }) => eq(workspaceTable.teamDbId, args.teamDbId),
		orderBy: (workspaceTable, { desc }) => [desc(workspaceTable.createdAt)],
		limit: 200,
	});

	let candidates = teamWorkspaces.filter(
		(workspace) =>
			workspace.metadata.starterTemplate?.useCaseId === args.useCaseId,
	);
	if (args.workspaceId) {
		candidates = candidates.filter((workspace) => workspace.id === args.workspaceId);
	}

	return candidates[0] ?? null;
}

function createDefaultSnapshot(useCaseId: AiStudioUseCaseId): UseCaseDeploymentSnapshot {
	return {
		useCaseId,
		stage: DEFAULT_STAGE,
		canaryPolicy: DEFAULT_CANARY_POLICY,
		updatedAt: new Date(0).toISOString(),
		workspaceId: null,
		history: [],
	};
}

export async function getUseCaseDeploymentSnapshot(args: {
	teamDbId: number;
	useCaseId: AiStudioUseCaseId;
	workspaceId?: string | null;
}): Promise<UseCaseDeploymentSnapshot> {
	const workspace = await findLatestUseCaseWorkspace(args);
	if (!workspace) {
		return createDefaultSnapshot(args.useCaseId);
	}

	const parsed = parseDeploymentFromMetadata(workspace.metadata);
	if (!parsed) {
		return {
			...createDefaultSnapshot(args.useCaseId),
			workspaceId: workspace.id,
		};
	}

	return {
		useCaseId: args.useCaseId,
		stage: parsed.stage,
		canaryPolicy: parsed.canaryPolicy,
		updatedAt: parsed.updatedAt,
		history: parsed.history,
		workspaceId: workspace.id,
	};
}

async function buildHistorySnapshot(args: {
	workspaceId: string;
	workspaceName: string | null;
	workspaceUpdatedAt: string;
	metadata: WorkspaceMetadata;
	canaryPolicy: CanaryPolicy;
}): Promise<DeploymentHistorySnapshot> {
	const workspaceData = await giselle.getWorkspace(
		args.workspaceId as `wrks-${string}`,
	);
	const workflowBlueprint = args.metadata.starterTemplate?.workflowBlueprint;
	const requiredSourceKinds =
		workflowBlueprint?.requiredSources && workflowBlueprint.requiredSources.length > 0
			? workflowBlueprint.requiredSources
			: workflowBlueprint?.sourceNodes ?? [];

	const nodeTypeCounts: Record<string, number> = {};
	const modelIds = new Set<string>();
	for (const node of workspaceData.nodes ?? []) {
		const contentType = node?.content?.type;
		if (typeof contentType === "string") {
			nodeTypeCounts[contentType] = (nodeTypeCounts[contentType] ?? 0) + 1;
		}

		if (
			(contentType === "textGeneration" || contentType === "imageGeneration") &&
			typeof node?.content?.llm?.id === "string"
		) {
			modelIds.add(node.content.llm.id);
		}
	}

	return {
		workspaceId: args.workspaceId,
		workspaceName: args.workspaceName ?? workspaceData.name ?? "Untitled",
		workspaceUpdatedAt: args.workspaceUpdatedAt,
		nodeCount: (workspaceData.nodes ?? []).length,
		nodeTypeCounts,
		modelIds: [...modelIds],
		requiredSources: [...requiredSourceKinds],
		sourceNodes: [...requiredSourceKinds],
		objective: workflowBlueprint?.objective ?? "",
		canaryPolicy: args.canaryPolicy,
	};
}

export function buildDeploymentDiff(
	history: DeploymentHistoryEvent[],
): UseCaseDeploymentDiff | null {
	if (history.length < 2) return null;

	const previous = history[history.length - 2];
	const latest = history[history.length - 1];
	const changes: string[] = [];

	if (previous.toStage !== latest.toStage) {
		changes.push(
			`Stage changed from ${previous.toStage.toUpperCase()} to ${latest.toStage.toUpperCase()}.`,
		);
	}

	const prevSnapshot = previous.snapshot;
	const nextSnapshot = latest.snapshot;
	if (prevSnapshot && nextSnapshot) {
		if (
			prevSnapshot.canaryPolicy?.rolloutPercentage !==
			nextSnapshot.canaryPolicy?.rolloutPercentage
		) {
			changes.push(
				`Canary rollout changed from ${prevSnapshot.canaryPolicy?.rolloutPercentage ?? 0}% to ${nextSnapshot.canaryPolicy?.rolloutPercentage ?? 0}%.`,
			);
		}
		if (prevSnapshot.canaryPolicy?.audience !== nextSnapshot.canaryPolicy?.audience) {
			changes.push(
				`Canary audience changed from ${prevSnapshot.canaryPolicy?.audience ?? "unknown"} to ${nextSnapshot.canaryPolicy?.audience ?? "unknown"}.`,
			);
		}
		if (prevSnapshot.nodeCount !== nextSnapshot.nodeCount) {
			changes.push(
				`Workflow node count changed from ${prevSnapshot.nodeCount} to ${nextSnapshot.nodeCount}.`,
			);
		}

		const previousModels = [...prevSnapshot.modelIds].sort().join(", ");
		const nextModels = [...nextSnapshot.modelIds].sort().join(", ");
		if (previousModels !== nextModels) {
			changes.push("Model mix changed for this release.");
		}

		const previousSources = [...prevSnapshot.sourceNodes].sort().join(", ");
		const nextSources = [...nextSnapshot.sourceNodes].sort().join(", ");
		if (previousSources !== nextSources) {
			changes.push("Source requirements changed.");
		}

		if (prevSnapshot.objective !== nextSnapshot.objective) {
			changes.push("Workflow objective changed.");
		}
	}

	if (changes.length === 0) {
		changes.push("No structural workflow changes detected; stage transition only.");
	}

	return {
		fromChangedAt: previous.changedAt,
		toChangedAt: latest.changedAt,
		changes,
	};
}

export async function updateUseCaseDeploymentStage(args: {
	teamDbId: number;
	useCaseId: AiStudioUseCaseId;
	nextStage: DeploymentStage;
	actorUserId: string;
	reason: string;
	workspaceId?: string | null;
	canaryPolicy?: Partial<CanaryPolicy>;
}): Promise<UseCaseDeploymentSnapshot> {
	const workspace = await findLatestUseCaseWorkspace(args);
	if (!workspace) {
		throw new Error(
			`No workspace found for use case ${args.useCaseId}. Bootstrap a workspace first.`,
		);
	}

	const metadata = workspace.metadata;
	const existingDeployment = metadata.starterTemplate?.deployment;
	const currentStage = existingDeployment?.stage ?? DEFAULT_STAGE;
	const nextCanaryPolicy = normalizeCanaryPolicy(
		args.canaryPolicy ?? existingDeployment?.canaryPolicy,
	);
	const historySnapshot = await buildHistorySnapshot({
		workspaceId: workspace.id,
		workspaceName: workspace.name,
		workspaceUpdatedAt: workspace.updatedAt.toISOString(),
		metadata,
		canaryPolicy: nextCanaryPolicy,
	});

	const history: DeploymentHistoryEvent[] = [
		...(existingDeployment?.history ?? []),
		{
			fromStage: currentStage,
			toStage: args.nextStage,
			reason: args.reason,
			changedAt: new Date().toISOString(),
			actorUserId: args.actorUserId,
			snapshot: historySnapshot,
		},
	];

	const nextMetadata: WorkspaceMetadata = {
		...metadata,
		starterTemplate: {
			...(metadata.starterTemplate ?? {
				useCaseId: args.useCaseId,
				starterPrompt: "",
				createdAt: workspace.createdAt.toISOString(),
			}),
			useCaseId: args.useCaseId,
			deployment: {
				stage: args.nextStage,
				canaryPolicy: nextCanaryPolicy,
				updatedAt: new Date().toISOString(),
				history,
			},
		},
	};

	await db
		.update(workspaces)
		.set({
			metadata: nextMetadata,
			updatedAt: new Date(),
		})
		.where(
			and(eq(workspaces.dbId, workspace.dbId), eq(workspaces.teamDbId, args.teamDbId)),
		);

	return {
		useCaseId: args.useCaseId,
		stage: args.nextStage,
		canaryPolicy: nextCanaryPolicy,
		updatedAt: nextMetadata.starterTemplate?.deployment?.updatedAt ?? new Date().toISOString(),
		history,
		workspaceId: workspace.id,
	};
}
