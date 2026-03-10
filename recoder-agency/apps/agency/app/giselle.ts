import type {
	AiGatewayHeaders,
	BuildAiGatewayHeadersArgs,
	GiselleCallbacks,
	QueryContext,
} from "@recoder/giselle";
import { traceEmbedding } from "@recoder/langfuse";
import { getRequestId, NextGiselle } from "@recoder/nextjs/internal";
import {
	type CompletedGeneration,
	type Generation,
	type RunningGeneration,
	WorkspaceId,
} from "@recoder/protocol";
import type { EmbeddingMetrics } from "@recoder/rag";
import {
	supabaseStorageDriver as experimental_supabaseStorageDriver,
	supabaseVaultDriver,
} from "@recoder/supabase-driver";
import { tasks as jobs } from "@trigger.dev/sdk";
import { eq, sql } from "drizzle-orm";
import { apps, db, tasks } from "@/db";
import { generateContentNodeFlag } from "@/flags";
import { logGenerationCost } from "@/lib/agency/generation-cost-logger";
import {
	extractRequestedModelIdFromGeneration,
	resolveModelRoutingPolicyForWorkspace,
} from "@/lib/agency/model-routing";
import { GenerationMetadata } from "@/lib/generation-metadata";
import { logger } from "@/lib/logger";
import { traceGenerationForTeam } from "@/lib/trace";
import { getWorkspaceTeam } from "@/lib/workspaces/get-workspace-team";
import { fetchUsageLimits } from "@/packages/lib/fetch-usage-limits";
import { onConsumeAgentTime } from "@/packages/lib/on-consume-agent-time";
import { fetchCurrentUser } from "@/services/accounts";
import { type CurrentTeam, fetchCurrentTeam } from "@/services/teams";
import type { runTaskJob } from "@/trigger/run-task-job";
import { getDocumentVectorStoreQueryService } from "../lib/vector-stores/document/query/service";
import {
	gitHubIssueQueryService,
	gitHubPullRequestQueryService,
	gitHubQueryService,
} from "../lib/vector-stores/github";
import type { generateContentJob } from "../trigger/generate-content-job";

export const storage = experimental_supabaseStorageDriver({
	endpoint: process.env.SUPABASE_STORAGE_URL ?? "",
	region: process.env.SUPABASE_STORAGE_REGION ?? "",
	accessKeyId: process.env.SUPABASE_STORAGE_ACCESS_KEY_ID ?? "",
	secretAccessKey: process.env.SUPABASE_STORAGE_SECRET_ACCESS_KEY ?? "",
	bucket: "app",
});

const vault = supabaseVaultDriver({
	url: process.env.SUPABASE_URL ?? "",
	serviceKey: process.env.SUPABASE_SERVICE_KEY ?? "",
});

let sampleAppWorkspaceIds: WorkspaceId[] | undefined;
if (process.env.SAMPLE_APP_WORKSPACE_IDS) {
	const workspaceIdStrings = process.env.SAMPLE_APP_WORKSPACE_IDS.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
	const parsedWorkspaceIds: WorkspaceId[] = [];
	for (const workspaceIdString of workspaceIdStrings) {
		const parseResult = WorkspaceId.safeParse(workspaceIdString);
		if (parseResult.success) {
			parsedWorkspaceIds.push(parseResult.data);
		}
	}
	if (parsedWorkspaceIds.length > 0) {
		sampleAppWorkspaceIds = parsedWorkspaceIds;
	}
}

const githubAppId = process.env.GITHUB_APP_ID;
const githubAppPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
const githubAppClientId = process.env.GITHUB_APP_CLIENT_ID;
const githubAppClientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
const githubAppWebhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

const hasGitHubCredentials =
	githubAppId !== undefined &&
	githubAppPrivateKey !== undefined &&
	githubAppClientId !== undefined &&
	githubAppClientSecret !== undefined &&
	githubAppWebhookSecret !== undefined;

if (!hasGitHubCredentials) {
	console.warn(
		"GitHub App credentials are not fully configured. GitHub integration features will be unavailable.",
	);
}

type TeamForPlan = Pick<
	CurrentTeam,
	"id" | "activeSubscriptionId" | "activeCustomerId" | "plan"
>;

async function traceEmbeddingForTeam(args: {
	metrics: EmbeddingMetrics;
	generation: RunningGeneration;
	queryContext: QueryContext;
	sessionId?: string;
	userId: string;
	team: TeamForPlan;
}) {
	const teamPlan = args.team.plan;
	const planTag = `plan:${teamPlan}`;

	const { queryContext } = args;
	const baseMetadata = {
		generationId: args.generation.id,
		teamId: args.team.id,
		teamPlan,
		userId: args.userId,
		subscriptionId: args.team.activeSubscriptionId ?? "",
		customerId: args.team.activeCustomerId ?? "",
		resourceProvider: queryContext.provider,
		workspaceId: queryContext.workspaceId,
		embeddingProfileId: queryContext.embeddingProfileId,
	};

	const traceArgs = {
		metrics: args.metrics,
		userId: args.userId,
		sessionId: args.sessionId,
		tags: [planTag, "embedding-purpose:query"],
	};

	switch (queryContext.provider) {
		case "github": {
			await traceEmbedding({
				...traceArgs,
				metadata: {
					...baseMetadata,
					resourceContentType: queryContext.contentType,
					resourceOwner: queryContext.owner,
					resourceRepo: queryContext.repo,
				},
			});
			break;
		}
		case "document": {
			await traceEmbedding({
				...traceArgs,
				metadata: {
					...baseMetadata,
					documentVectorStoreId: queryContext.documentVectorStoreId,
				},
			});
			break;
		}
		default: {
			const _exhaustiveCheck: never = queryContext;
			throw new Error(`Unsupported provider: ${_exhaustiveCheck}`);
		}
	}
}

function getRuntimeEnv(): "trigger.dev" | "vercel" | "local" | "unknown" {
	if (process.env.TRIGGERDOTDEV === "1") return "trigger.dev";
	if (process.env.VERCEL === "1") return "vercel";
	if (process.env.NODE_ENV === "development") return "local";
	return "unknown";
}

function parseEnvNumber(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function parseProviderAndModel(
	modelSpecifier: string,
): { provider: string; modelId: string } | null {
	const trimmed = modelSpecifier.trim();
	const slashIndex = trimmed.indexOf("/");
	if (slashIndex <= 0 || slashIndex === trimmed.length - 1) return null;
	return {
		provider: trimmed.slice(0, slashIndex),
		modelId: trimmed.slice(slashIndex + 1),
	};
}

function getRequestedGatewayModelSpecifier(
	generation: Pick<Generation, "context">,
): string | null {
	const content = generation.context.operationNode.content as Record<
		string,
		unknown
	>;
	if (content.type === "textGeneration") {
		const llm = content.llm as { provider?: string; id?: string } | undefined;
		if (!llm?.provider || !llm?.id) return null;
		return `${llm.provider}/${llm.id}`;
	}
	if (content.type === "contentGeneration") {
		const languageModel = content.languageModel as { id?: string } | undefined;
		return languageModel?.id?.trim() ? languageModel.id.trim() : null;
	}
	return null;
}

function pickRuntimeModelOverride(args: {
	requestedModelSpecifier: string | null;
	preferredModelSpecifier: string;
	fallbackModelSpecifier: string | null;
}): { selectedModelSpecifier: string; wasFallback: boolean } | null {
	const preferred = parseProviderAndModel(args.preferredModelSpecifier);
	if (!preferred) return null;

	const requested = args.requestedModelSpecifier
		? parseProviderAndModel(args.requestedModelSpecifier)
		: null;
	if (!requested) {
		return {
			selectedModelSpecifier: args.preferredModelSpecifier,
			wasFallback: false,
		};
	}
	if (requested.provider === preferred.provider) {
		return {
			selectedModelSpecifier: args.preferredModelSpecifier,
			wasFallback: false,
		};
	}
	if (args.fallbackModelSpecifier) {
		const fallback = parseProviderAndModel(args.fallbackModelSpecifier);
		if (fallback && fallback.provider === requested.provider) {
			return {
				selectedModelSpecifier: args.fallbackModelSpecifier,
				wasFallback: true,
			};
		}
	}
	return null;
}

/**
 * Find the agency project linked to a workspace, if any.
 * Returns only the db_id so the cost logger can reference it.
 */
async function findProjectDbIdForWorkspace(
	workspaceId: string,
): Promise<number | null> {
	try {
		const result = await db.execute(sql`
			SELECT p.db_id
			FROM public.projects p
			INNER JOIN public.workspaces w ON w.db_id = p.workspace_db_id
			WHERE w.id = ${workspaceId}
			LIMIT 1
		`);
		const row = result.rows[0] as { db_id: number } | undefined;
		return row?.db_id ?? null;
	} catch {
		return null;
	}
}

/**
 * Non-blocking: log AI generation cost after tracing completes.
 */
async function logCostIfAgencyProject(
	generation: CompletedGeneration,
	teamDbId: number,
): Promise<void> {
	try {
		const workspaceId = generation.context.origin.workspaceId;
		const projectDbId = await findProjectDbIdForWorkspace(workspaceId);
		const policy = await resolveModelRoutingPolicyForWorkspace(workspaceId);
		const requestedModelSpecifier =
			getRequestedGatewayModelSpecifier(generation);
		const runtimeChoice = policy
			? pickRuntimeModelOverride({
					requestedModelSpecifier,
					preferredModelSpecifier: policy.preferredModelId,
					fallbackModelSpecifier: policy.fallbackModelId,
				})
			: null;
		const routedModel = runtimeChoice
			? parseProviderAndModel(runtimeChoice.selectedModelSpecifier)
			: null;
		await logGenerationCost({
			generation,
			teamDbId,
			projectDbId,
			routingPolicyDbId: policy?.dbId ?? null,
			routedModel,
			wasFallback: runtimeChoice?.wasFallback ?? false,
		});
	} catch (error) {
		console.error("logCostIfAgencyProject failed:", error);
	}
}

const runtimeEnv = getRuntimeEnv();

const generateContentProcessor =
	process.env.USE_TRIGGER_DEV === "1" ||
	runtimeEnv === "trigger.dev" ||
	(runtimeEnv === "vercel" && process.env.NODE_ENV !== "development")
		? "trigger.dev"
		: "self";

const callbacks: GiselleCallbacks = {
	appCreate: async ({ app }) => {
		const currentTeam = await fetchCurrentTeam();
		const workspace = await db.query.workspaces.findFirst({
			where: (workspaces, { eq }) => eq(workspaces.id, app.workspaceId),
		});
		if (workspace === undefined) {
			throw new Error(`Workspace not found for app ${app.id}`);
		}
		await db.insert(apps).values({
			id: app.id,
			appEntryNodeId: app.entryNodeId,
			endNodeId: app.state === "connected" ? app.endNodeId : null,
			teamDbId: currentTeam.dbId,
			workspaceDbId: workspace.dbId,
		});
	},
	appDelete: async ({ appId }) => {
		await db.delete(apps).where(eq(apps.id, appId));
	},
	appConnectionChange: async (args) => {
		switch (args.event) {
			case "connected": {
				const app = args.payload.app;
				await db
					.update(apps)
					.set({
						appEntryNodeId: app.entryNodeId,
						endNodeId: app.endNodeId,
					})
					.where(eq(apps.id, app.id));
				break;
			}
			case "disconnected": {
				const app = args.payload.app;
				await db
					.update(apps)
					.set({
						appEntryNodeId: app.entryNodeId,
						endNodeId: null,
					})
					.where(eq(apps.id, app.id));
				break;
			}
			default: {
				const _exhaustiveCheck: never = args;
				throw new Error(`Unhandled event: ${_exhaustiveCheck}`);
			}
		}
	},
	generationComplete: async (args) => {
		const requestId = getRequestId();
		if (
			args.generation.context.origin.type === "github-app" ||
			args.generation.context.origin.type === "api"
		) {
			const team = await getWorkspaceTeam(
				args.generation.context.origin.workspaceId,
			);
			await traceGenerationForTeam({
				...args,
				requestId,
				userId:
					args.generation.context.origin.type === "github-app"
						? "github-app"
						: "api",
				team,
				sessionId: args.generation.context.origin.taskId,
			});
			// Non-blocking cost log
			logCostIfAgencyProject(args.generation, team.dbId).catch((err: unknown) => {
			console.warn("[Agency] Cost logging failed:", err);
		});
			return;
		}
		const [currentUser, currentTeam] = await Promise.all([
			fetchCurrentUser(),
			fetchCurrentTeam(),
		]);
		await traceGenerationForTeam({
			...args,
			requestId,
			userId: currentUser.id,
			team: currentTeam,
			sessionId: args.generation.context.origin.taskId,
		});
		// Non-blocking cost log
		logCostIfAgencyProject(args.generation, currentTeam.dbId).catch((err: unknown) => {
			console.warn("[Agency] Cost logging failed:", err);
		});
	},
	generationError: async (args) => {
		const requestId = getRequestId();
		if (
			args.generation.context.origin.type === "github-app" ||
			args.generation.context.origin.type === "api"
		) {
			const team = await getWorkspaceTeam(
				args.generation.context.origin.workspaceId,
			);
			await traceGenerationForTeam({
				...args,
				requestId,
				userId:
					args.generation.context.origin.type === "github-app"
						? "github-app"
						: "api",
				team,
			});
			return;
		}
		const [currentUser, currentTeam] = await Promise.all([
			fetchCurrentUser(),
			fetchCurrentTeam(),
		]);
		await traceGenerationForTeam({
			...args,
			requestId,
			userId: currentUser.id,
			team: currentTeam,
		});
	},
	embeddingComplete: async (args) => {
		try {
			if (runtimeEnv === "trigger.dev") {
				const parsedMetadata = GenerationMetadata.parse(
					args.generationMetadata,
				);

				await traceEmbeddingForTeam({
					metrics: args.embeddingMetrics,
					generation: args.generation,
					queryContext: args.queryContext,
					sessionId: args.generation.context.origin.taskId,
					userId: parsedMetadata.userId,
					team: {
						id: parsedMetadata.team.id,
						activeSubscriptionId: parsedMetadata.team.subscriptionId,
						activeCustomerId: parsedMetadata.team.activeCustomerId,
						plan: parsedMetadata.team.plan,
					},
				});
				return;
			}
			switch (args.generation.context.origin.type) {
				case "github-app": {
					const team = await getWorkspaceTeam(
						args.generation.context.origin.workspaceId,
					);
					await traceEmbeddingForTeam({
						metrics: args.embeddingMetrics,
						generation: args.generation,
						queryContext: args.queryContext,
						sessionId: args.generation.context.origin.taskId,
						userId: "github-app",
						team,
					});
					break;
				}
				case "api": {
					const team = await getWorkspaceTeam(
						args.generation.context.origin.workspaceId,
					);
					await traceEmbeddingForTeam({
						metrics: args.embeddingMetrics,
						generation: args.generation,
						queryContext: args.queryContext,
						sessionId: args.generation.context.origin.taskId,
						userId: "api",
						team,
					});
					break;
				}
				case "stage":
				case "studio": {
					const [currentUser, currentTeam] = await Promise.all([
						fetchCurrentUser(),
						fetchCurrentTeam(),
					]);
					await traceEmbeddingForTeam({
						metrics: args.embeddingMetrics,
						generation: args.generation,
						queryContext: args.queryContext,
						sessionId: args.generation.context.origin.taskId,
						userId: currentUser.id,
						team: currentTeam,
					});
					break;
				}
				default: {
					const _exhaustiveCheck: never = args.generation.context.origin;
					throw new Error(`Unhandled origin type: ${_exhaustiveCheck}`);
				}
			}
		} catch (error) {
			console.error("Embedding callback failed:", error);
		}
	},
	taskCreate: async ({ task }) => {
		let appDbId: number | undefined;

		if (task.starter.type === "app") {
			const appId = task.starter.appId;
			const app = await db.query.apps.findFirst({
				where: (apps, { eq }) => eq(apps.id, appId),
				columns: {
					dbId: true,
				},
			});
			appDbId = app?.dbId;
		}
		if (
			task.starter.type === "github-trigger" &&
			task.starter.end.type === "endNode"
		) {
			const appId = task.starter.end.appId;
			const app = await db.query.apps.findFirst({
				where: (apps, { eq }) => eq(apps.id, appId),
				columns: {
					dbId: true,
				},
			});
			appDbId = app?.dbId;
		}

		const workspace = await db.query.workspaces.findFirst({
			where: (workspaces, { eq }) => eq(workspaces.id, task.workspaceId),
			columns: {},
			with: {
				team: {
					columns: {
						dbId: true,
					},
				},
			},
		});
		if (workspace === undefined) {
			throw new Error(`Workspace not found for task ${task.id}`);
		}

		await db.insert(tasks).values({
			id: task.id,
			appDbId,
			teamDbId: workspace.team.dbId,
		});
	},
	buildAiGatewayHeaders: async ({
		metadata,
		generation,
	}: BuildAiGatewayHeadersArgs) => {
		const parsedMetadata = GenerationMetadata.safeParse(metadata);
		const polarCustomerId = parsedMetadata.success
			? (parsedMetadata.data.team.activeCustomerId ?? undefined)
			: undefined;
		const teamPlan = parsedMetadata.success
			? parsedMetadata.data.team.plan
			: undefined;
		const aiGatewayHeaders: AiGatewayHeaders = {
			"http-referer":
				process.env.AI_GATEWAY_HTTP_REFERER ?? "https://agency.recoder.xyz",
			"x-title": process.env.AI_GATEWAY_X_TITLE ?? "Recoder Agency",
		};
		if (polarCustomerId !== undefined) {
			aiGatewayHeaders["polar-customer-id"] = polarCustomerId;
		} else if (teamPlan === "pro" || teamPlan === "team") {
			logger.warn(
				`Polar customer ID not found for generation ${generation.id}`,
			);
		}

		// Best-effort model-routing hint headers for AI gateway.
		// Also includes runtime model override (`x-giselle-model-override`) so
		// fallback enforcement applies before provider call execution.
		try {
			const workspaceId = generation.context.origin.workspaceId;
			const policy = await resolveModelRoutingPolicyForWorkspace(workspaceId);
			if (policy) {
				const requestedModelSpecifier =
					getRequestedGatewayModelSpecifier(generation);
				const requestedModelId =
					extractRequestedModelIdFromGeneration(generation);
				aiGatewayHeaders["x-recoder-routing-policy-id"] = String(policy.dbId);
				aiGatewayHeaders["x-recoder-routing-policy-name"] = policy.name;
				aiGatewayHeaders["x-recoder-routing-preferred-model-id"] =
					policy.preferredModelId;
				if (policy.fallbackModelId) {
					aiGatewayHeaders["x-recoder-routing-fallback-model-id"] =
						policy.fallbackModelId;
				}
				if (policy.costCeilingCentsPerGeneration != null) {
					aiGatewayHeaders["x-recoder-routing-cost-ceiling-cents"] = String(
						policy.costCeilingCentsPerGeneration,
					);
				}
				if (requestedModelId) {
					aiGatewayHeaders["x-recoder-routing-requested-model-id"] =
						requestedModelId;
				}

				const runtimeChoice = pickRuntimeModelOverride({
					requestedModelSpecifier,
					preferredModelSpecifier: policy.preferredModelId,
					fallbackModelSpecifier: policy.fallbackModelId,
				});
				if (runtimeChoice) {
					aiGatewayHeaders["x-giselle-model-override"] =
						runtimeChoice.selectedModelSpecifier;
					aiGatewayHeaders["x-recoder-routing-was-fallback"] =
						runtimeChoice.wasFallback ? "1" : "0";
				}
			}
		} catch (error) {
			logger.warn(
				`Model routing policy resolution failed for generation ${generation.id}: ${error}`,
			);
		}

		return aiGatewayHeaders;
	},
};

export const githubWebhookCallbacks = {
	onGenerationComplete: callbacks.generationComplete,
	onGenerationError: callbacks.generationError,
	onTaskCreate: callbacks.taskCreate,
} as const;

export const giselle = NextGiselle({
	basePath: "/api/engine",
	storage,
	llmProviders: ["openai", "anthropic", "google"],
	apiSecretScrypt: {
		params: {
			n: parseEnvNumber(process.env.GISELLE_API_SECRET_SCRYPT_N, 16384),
			r: parseEnvNumber(process.env.GISELLE_API_SECRET_SCRYPT_R, 8),
			p: parseEnvNumber(process.env.GISELLE_API_SECRET_SCRYPT_P, 1),
			keyLen: parseEnvNumber(process.env.GISELLE_API_SECRET_SCRYPT_KEY_LEN, 32),
		},
		saltBytes: parseEnvNumber(
			process.env.GISELLE_API_SECRET_SCRYPT_SALT_BYTES,
			16,
		),
		logDuration: process.env.GISELLE_API_SECRET_SCRYPT_LOG_DURATION === "1",
	},
	onConsumeAgentTime,
	fetchUsageLimitsFn: fetchUsageLimits,
	sampleAppWorkspaceIds,
	integrationConfigs: {
		github: {
			auth: {
				strategy: "app-installation",
				appId: "",
				privateKey: "",
				resolver: {
					installationIdForRepo: () => 1234,
					installationIds: () => [1234],
				},
			},
			...(hasGitHubCredentials
				? {
						authV2: {
							appId: githubAppId!,
							privateKey: githubAppPrivateKey!,
							clientId: githubAppClientId!,
							clientSecret: githubAppClientSecret!,
							webhookSecret: githubAppWebhookSecret!,
						},
					}
				: {}),
		},
	},
	vault,
	vectorStoreQueryServices: {
		github: gitHubQueryService,
		githubIssue: gitHubIssueQueryService,
		githubPullRequest: gitHubPullRequestQueryService,
		document: getDocumentVectorStoreQueryService(),
	},
	callbacks,
	logger,
	async onRequest({ updateContext }) {
		const useGenerateContentNode = await generateContentNodeFlag();
		updateContext({
			experimental_contentGenerationNode: useGenerateContentNode,
		});
	},
});

// Content generation processor: Trigger.dev implementation
//
// This processor delegates content generation to Trigger.dev jobs.
// The branching logic handles two main flows:
//
// 1. setGenerateContentProcess:
//    - Determines user context based on generation origin:
//      a) "github-app": GitHub App automation (no authenticated user)
//         → Fetch team from workspaceId, use "github-app" as userId
//      b) "stage" / "studio": Interactive user sessions
//         → Further branch by runtimeEnv:
//            - "local" / "vercel" / "unknown": Outside Trigger.dev context
//              → Fetch currentUser and currentTeam from session
//            - "trigger.dev": Already inside a Trigger.dev job
//              → Parse user/team from metadata to avoid circular auth calls
//
// 2. setRunActProcess:
//    - Determines user context based on generationOriginType:
//      a) "github-app": GitHub App automation
//         → Fetch team from workspaceId, use "github-app" as userId
//      b) "stage" / "studio": Interactive user sessions
//         → Fetch currentUser and currentTeam from session
//
// Key insight:
// - "github-app" origin has no authenticated user → derive context from workspaceId
// - "stage"/"studio" origin needs user context → fetch from session or metadata
// - When already inside Trigger.dev (runtimeEnv === "trigger.dev"),
//   use metadata to avoid re-fetching auth state
if (generateContentProcessor === "trigger.dev") {
	giselle.setGenerateContentProcess(async ({ generation, metadata }) => {
		const requestId = getRequestId();
		switch (generation.context.origin.type) {
			case "github-app": {
				const team = await getWorkspaceTeam(
					generation.context.origin.workspaceId,
				);
				await jobs.trigger<typeof generateContentJob>("generate-content", {
					generationId: generation.id,
					requestId,
					userId: "github-app",
					team: {
						id: team.id,
						subscriptionId: team.activeSubscriptionId,
						activeCustomerId: team.activeCustomerId,
						plan: team.plan,
					},
				});
				break;
			}
			case "api": {
				const team = await getWorkspaceTeam(
					generation.context.origin.workspaceId,
				);
				await jobs.trigger<typeof generateContentJob>("generate-content", {
					generationId: generation.id,
					requestId,
					userId: "api",
					team: {
						id: team.id,
						subscriptionId: team.activeSubscriptionId,
						activeCustomerId: team.activeCustomerId,
						plan: team.plan,
					},
				});
				break;
			}
			case "stage":
			case "studio": {
				switch (runtimeEnv) {
					case "local":
					case "vercel":
					case "unknown": {
						const [currentUser, currentTeam] = await Promise.all([
							fetchCurrentUser(),
							fetchCurrentTeam(),
						]);
						await jobs.trigger<typeof generateContentJob>("generate-content", {
							generationId: generation.id,
							requestId,
							userId: currentUser.id,
							team: {
								id: currentTeam.id,
								subscriptionId: currentTeam.activeSubscriptionId,
								activeCustomerId: currentTeam.activeCustomerId,
								plan: currentTeam.plan,
							},
						});
						break;
					}
					case "trigger.dev": {
						const parsedMetadata = GenerationMetadata.parse(metadata);
						await jobs.trigger<typeof generateContentJob>("generate-content", {
							generationId: generation.id,
							requestId,
							...parsedMetadata,
						});
						break;
					}
					default: {
						const _exhaustiveCheck: never = runtimeEnv;
						throw new Error(`Unhandled runtimeEnv: ${_exhaustiveCheck}`);
					}
				}
				break;
			}
			default: {
				const _exhaustiveCheck: never = generation.context.origin;
				throw new Error(`Unhandled origin type: ${_exhaustiveCheck}`);
			}
		}
	});

	giselle.setRunTaskProcess(async ({ task, generationOriginType }) => {
		const requestId = getRequestId();
		switch (generationOriginType) {
			case "github-app": {
				const team = await getWorkspaceTeam(task.workspaceId);

				await jobs.trigger<typeof runTaskJob>("run-task-job", {
					taskId: task.id,
					requestId,
					userId: "github-app",
					team: {
						id: team.id,
						subscriptionId: team.activeSubscriptionId,
						activeCustomerId: team.activeCustomerId,
						plan: team.plan,
					},
				});
				break;
			}
			case "api": {
				const team = await getWorkspaceTeam(task.workspaceId);

				await jobs.trigger<typeof runTaskJob>("run-task-job", {
					taskId: task.id,
					requestId,
					userId: "api",
					team: {
						id: team.id,
						subscriptionId: team.activeSubscriptionId,
						activeCustomerId: team.activeCustomerId,
						plan: team.plan,
					},
				});
				break;
			}
			case "stage":
			case "studio": {
				const [currentUser, currentTeam] = await Promise.all([
					fetchCurrentUser(),
					fetchCurrentTeam(),
				]);

				await jobs.trigger<typeof runTaskJob>("run-task-job", {
					taskId: task.id,
					requestId,
					userId: currentUser.id,
					team: {
						id: currentTeam.id,
						subscriptionId: currentTeam.activeSubscriptionId,
						activeCustomerId: currentTeam.activeCustomerId,
						plan: currentTeam.plan,
					},
				});
				break;
			}
			default: {
				const _exhaustiveCheck: never = generationOriginType;
				throw new Error(`Unhandled origin type: ${_exhaustiveCheck}`);
			}
		}
	});
}
