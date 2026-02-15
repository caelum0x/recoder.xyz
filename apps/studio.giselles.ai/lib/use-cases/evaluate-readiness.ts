import {
	type AiStudioUseCaseId,
	RECODER_AI_STUDIO_USE_CASES,
} from "@recoder/ecosystem-config";
import { getTeamDataStores } from "@/lib/data-stores/queries";
import { getDocumentVectorStores } from "@/lib/vector-stores/document/queries";
import { getGitHubRepositoryIndexes } from "@/lib/vector-stores/github";
import type {
	UseCaseReadiness,
	UseCaseReadinessStatus,
} from "@/lib/use-cases/readiness";

function createReadiness(
	useCaseId: AiStudioUseCaseId,
	status: UseCaseReadinessStatus,
	message: string,
	actionPath: string | null,
	actionLabel: string | null,
): UseCaseReadiness {
	return { useCaseId, status, message, actionPath, actionLabel };
}

export async function evaluateUseCaseReadinessForTeam(
	teamDbId: number,
): Promise<Record<AiStudioUseCaseId, UseCaseReadiness>> {
	const [documentStores, githubIndexes, dataStores] = await Promise.all([
		getDocumentVectorStores(teamDbId),
		getGitHubRepositoryIndexes(teamDbId),
		getTeamDataStores(teamDbId),
	]);

	const sourceStatuses = documentStores.flatMap((store) =>
		store.sources.map((source) => source.ingestStatus),
	);
	const hasDocumentStore = documentStores.length > 0;
	const hasDocumentSource = sourceStatuses.length > 0;
	const hasCompletedDocumentIngest = sourceStatuses.includes("completed");
	const hasRunningDocumentIngest = sourceStatuses.includes("running");
	const hasFailedDocumentIngest = sourceStatuses.includes("failed");
	const hasPendingDocumentIngest = sourceStatuses.includes("idle");
	const hasDataStore = dataStores.length > 0;
	const hasGithubIndex = githubIndexes.length > 0;

	return {
		"agent-ops-platform": createReadiness(
			"agent-ops-platform",
			"ready",
			"Studio control plane is ready. Start building and validating your production workflow.",
			null,
			null,
		),
		"support-copilot": hasCompletedDocumentIngest || hasGithubIndex
			? createReadiness(
					"support-copilot",
					"ready",
					"Knowledge sources are connected and ready for support workflows.",
					null,
					null,
				)
			: hasFailedDocumentIngest
				? createReadiness(
						"support-copilot",
						"setup_required",
						"Some document ingests failed. Fix failed files or re-run ingest before support rollout.",
						"/settings/team/vector-stores/document",
						"Review failed ingests",
					)
			: hasDocumentStore && hasDocumentSource && hasRunningDocumentIngest
				? createReadiness(
						"support-copilot",
						"ingesting",
						"Document ingest is running. You can start now, quality will improve as indexing completes.",
						"/settings/team/vector-stores/document",
						"View ingest status",
					)
				: hasDocumentStore && hasDocumentSource && hasPendingDocumentIngest
					? createReadiness(
							"support-copilot",
							"ingesting",
							"Documents are connected but not fully ingested yet.",
							"/settings/team/vector-stores/document",
							"Start or monitor ingest",
						)
				: createReadiness(
						"support-copilot",
						"setup_required",
						"Connect document or GitHub vector sources before running production support triage.",
						"/settings/team/vector-stores",
						"Set up vector stores",
					),
		"sales-outreach": createReadiness(
			"sales-outreach",
			"ready",
			hasDataStore
				? "Data stores are connected for personalization inputs."
				: "Ready to run with prompt-only inputs. Add data stores later for stronger personalization.",
			hasDataStore ? null : "/settings/team/data-stores",
			hasDataStore ? null : "Add data stores",
		),
		"content-ops": createReadiness(
			"content-ops",
			"ready",
			"Ready to run with workspace prompts and reusable templates.",
			null,
			null,
		),
		"product-analyst": hasDataStore || hasCompletedDocumentIngest
			? createReadiness(
					"product-analyst",
					"ready",
					"Product insight data sources are available.",
					null,
					null,
				)
			: hasFailedDocumentIngest
				? createReadiness(
						"product-analyst",
						"setup_required",
						"Document ingest failures detected. Resolve failed sources or connect data stores.",
						"/settings/team/vector-stores/document",
						"Review failed ingests",
					)
			: hasDocumentStore && hasDocumentSource && hasRunningDocumentIngest
				? createReadiness(
						"product-analyst",
						"ingesting",
						"Data is indexing. Early clustering works now and improves after ingest completes.",
						"/settings/team/vector-stores/document",
						"View ingest status",
					)
				: hasDocumentStore && hasDocumentSource && hasPendingDocumentIngest
					? createReadiness(
							"product-analyst",
							"ingesting",
							"Sources are connected and pending ingest for full product-signal coverage.",
							"/settings/team/vector-stores/document",
							"Start or monitor ingest",
						)
				: createReadiness(
						"product-analyst",
						"setup_required",
						"Connect data stores or document vector sources to generate evidence-backed product insights.",
						"/settings/team/data-stores",
						"Set up data stores",
					),
		"knowledge-assistant": hasCompletedDocumentIngest
			? createReadiness(
					"knowledge-assistant",
					"ready",
					"Knowledge assistant can answer using indexed internal documents.",
					null,
					null,
				)
			: hasFailedDocumentIngest
				? createReadiness(
						"knowledge-assistant",
						"setup_required",
						"Knowledge ingest failures detected. Resolve failed sources before enabling assistant.",
						"/settings/team/vector-stores/document",
						"Review failed ingests",
					)
			: hasDocumentStore && hasDocumentSource && hasRunningDocumentIngest
				? createReadiness(
						"knowledge-assistant",
						"ingesting",
						"Knowledge sources are ingesting. Assistant quality increases as ingest completes.",
						"/settings/team/vector-stores/document",
						"View ingest status",
					)
				: hasDocumentStore && hasDocumentSource && hasPendingDocumentIngest
					? createReadiness(
							"knowledge-assistant",
							"ingesting",
							"Sources are attached and pending ingest.",
							"/settings/team/vector-stores/document",
							"Start or monitor ingest",
						)
				: createReadiness(
						"knowledge-assistant",
						"setup_required",
						"Upload and index internal docs before enabling knowledge Q&A.",
						"/settings/team/vector-stores/document",
						"Set up document stores",
					),
		"qa-automation": hasGithubIndex
			? createReadiness(
					"qa-automation",
					"ready",
					"Repository indexes are connected for release-aware QA generation.",
					null,
					null,
				)
			: createReadiness(
					"qa-automation",
					"setup_required",
					"Connect and index at least one GitHub repository for regression-aware QA automation.",
					"/settings/team/vector-stores",
					"Connect GitHub sources",
				),
	};
}

export async function evaluateUseCaseReadinessForTeamUseCase(
	teamDbId: number,
	useCaseId: AiStudioUseCaseId,
): Promise<UseCaseReadiness> {
	const readinessMap = await evaluateUseCaseReadinessForTeam(teamDbId);
	return readinessMap[useCaseId];
}

export function isKnownUseCaseId(value: string): value is AiStudioUseCaseId {
	return RECODER_AI_STUDIO_USE_CASES.some((item) => item.id === value);
}
