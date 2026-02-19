import {
	type AiStudioBlueprintSourceKind,
	type AiStudioUseCaseId,
	RECODER_AI_STUDIO_USE_CASES,
	resolveWorkflowRequiredSources,
} from "@recoder/ecosystem-config";
import { getTeamDataStores } from "@/lib/data-stores/queries";
import { getDocumentVectorStores } from "@/lib/vector-stores/document/queries";
import { getGitHubRepositoryIndexes } from "@/lib/vector-stores/github";
import { evaluateUseCaseReadinessForTeamUseCase } from "@/lib/use-cases/evaluate-readiness";
import type {
	UseCaseReadiness,
	UseCaseReadinessStatus,
} from "@/lib/use-cases/readiness";

export type SimulationCheckStatus = "pass" | "warn" | "fail";
export type SimulationReportStatus = "pass" | "warn" | "fail";

export interface UseCaseSimulationCheck {
	id: string;
	label: string;
	status: SimulationCheckStatus;
	details: string;
	actionPath: string | null;
}

export interface UseCaseSimulationReport {
	useCaseId: AiStudioUseCaseId;
	status: SimulationReportStatus;
	summary: string;
	objective: string;
	readiness: UseCaseReadiness;
	checks: UseCaseSimulationCheck[];
	generatedAt: string;
}

function statusWeight(status: SimulationCheckStatus): number {
	if (status === "fail") return 3;
	if (status === "warn") return 2;
	return 1;
}

function aggregateStatus(checks: UseCaseSimulationCheck[]): SimulationReportStatus {
	const maxWeight = checks.reduce(
		(max, check) => Math.max(max, statusWeight(check.status)),
		1,
	);
	if (maxWeight === 3) return "fail";
	if (maxWeight === 2) return "warn";
	return "pass";
}

function statusSummary(status: SimulationReportStatus): string {
	if (status === "pass") {
		return "Simulation passed. Workflow is ready for controlled rollout.";
	}
	if (status === "warn") {
		return "Simulation passed with warnings. Address noted gaps before full rollout.";
	}
	return "Simulation failed. Resolve required blockers before deployment.";
}

function sourceLabel(kind: AiStudioBlueprintSourceKind): string {
	if (kind === "documentVectorStore") return "Document Vector Source";
	if (kind === "githubVectorStore") return "GitHub Repository Source";
	return "Data Store Source";
}

function sourceActionPath(kind: AiStudioBlueprintSourceKind): string {
	if (kind === "documentVectorStore") return "/settings/team/vector-stores/document";
	if (kind === "githubVectorStore") return "/settings/team/vector-stores";
	return "/settings/team/data-stores";
}

function evaluateReadinessCheck(
	readiness: UseCaseReadiness,
): UseCaseSimulationCheck {
	const readinessStatusMap: Record<UseCaseReadinessStatus, SimulationCheckStatus> = {
		ready: "pass",
		ingesting: "warn",
		setup_required: "fail",
	};

	return {
		id: "readiness-gate",
		label: "Readiness Gate",
		status: readinessStatusMap[readiness.status],
		details: readiness.message,
		actionPath: readiness.actionPath,
	};
}

function evaluateSourceCheck(args: {
	sourceKind: AiStudioBlueprintSourceKind;
	hasDocumentStore: boolean;
	hasCompletedDocumentIngest: boolean;
	hasRunningOrPendingDocumentIngest: boolean;
	hasGithubIndex: boolean;
	hasDataStore: boolean;
}): UseCaseSimulationCheck {
	const { sourceKind } = args;

	if (sourceKind === "documentVectorStore") {
		if (!args.hasDocumentStore) {
			return {
				id: `source-${sourceKind}`,
				label: sourceLabel(sourceKind),
				status: "fail",
				details: "No document vector store is configured.",
				actionPath: sourceActionPath(sourceKind),
			};
		}
		if (args.hasCompletedDocumentIngest) {
			return {
				id: `source-${sourceKind}`,
				label: sourceLabel(sourceKind),
				status: "pass",
				details: "Document source is indexed and ready.",
				actionPath: null,
			};
		}
		return {
			id: `source-${sourceKind}`,
			label: sourceLabel(sourceKind),
			status: args.hasRunningOrPendingDocumentIngest ? "warn" : "fail",
			details: args.hasRunningOrPendingDocumentIngest
				? "Document source is connected but ingest is still running or pending."
				: "Document source is configured but has no completed ingest.",
			actionPath: sourceActionPath(sourceKind),
		};
	}

	if (sourceKind === "githubVectorStore") {
		return {
			id: `source-${sourceKind}`,
			label: sourceLabel(sourceKind),
			status: args.hasGithubIndex ? "pass" : "fail",
			details: args.hasGithubIndex
				? "GitHub repository index is connected."
				: "No GitHub repository index is connected.",
			actionPath: args.hasGithubIndex ? null : sourceActionPath(sourceKind),
		};
	}

	return {
		id: `source-${sourceKind}`,
		label: sourceLabel(sourceKind),
		status: args.hasDataStore ? "pass" : "fail",
		details: args.hasDataStore
			? "Data store source is connected."
			: "No data store source is connected.",
		actionPath: args.hasDataStore ? null : sourceActionPath(sourceKind),
	};
}

function evaluateSimulationChecks(
	checks: readonly string[],
	readiness: UseCaseReadiness,
): UseCaseSimulationCheck[] {
	const status: SimulationCheckStatus =
		readiness.status === "ready"
			? "pass"
			: readiness.status === "ingesting"
				? "warn"
				: "fail";

	return checks.map((check, index) => ({
		id: `simulation-${index + 1}`,
		label: `Simulation Check ${index + 1}`,
		status,
		details: check,
		actionPath: readiness.actionPath,
	}));
}

function evaluateDeployChecks(
	checks: readonly string[],
	readiness: UseCaseReadiness,
): UseCaseSimulationCheck[] {
	return checks.map((check, index) => ({
		id: `deploy-${index + 1}`,
		label: `Deploy Check ${index + 1}`,
		status: readiness.status === "ready" ? "pass" : "warn",
		details: check,
		actionPath: readiness.status === "ready" ? null : readiness.actionPath,
	}));
}

function evaluateSuccessCriteriaChecks(
	criteria: readonly string[],
): UseCaseSimulationCheck[] {
	return criteria.map((item, index) => ({
		id: `success-${index + 1}`,
		label: `Success Criterion ${index + 1}`,
		status: "warn",
		details: `${item} (manual validation required during rollout)`,
		actionPath: null,
	}));
}

export async function simulateUseCaseForTeam(args: {
	teamDbId: number;
	useCaseId: AiStudioUseCaseId;
}): Promise<UseCaseSimulationReport> {
	const useCase = RECODER_AI_STUDIO_USE_CASES.find(
		(item) => item.id === args.useCaseId,
	);
	if (!useCase) {
		throw new Error(`Unknown use case: ${args.useCaseId}`);
	}

	const [readiness, documentStores, githubIndexes, dataStores] = await Promise.all([
		evaluateUseCaseReadinessForTeamUseCase(args.teamDbId, args.useCaseId),
		getDocumentVectorStores(args.teamDbId),
		getGitHubRepositoryIndexes(args.teamDbId),
		getTeamDataStores(args.teamDbId),
	]);

	const sourceStatuses = documentStores.flatMap((store) =>
		store.sources.map((source) => source.ingestStatus),
	);

	const hasDocumentStore = documentStores.length > 0;
	const hasCompletedDocumentIngest = sourceStatuses.includes("completed");
	const hasRunningOrPendingDocumentIngest =
		sourceStatuses.includes("running") || sourceStatuses.includes("idle");
	const hasGithubIndex = githubIndexes.length > 0;
	const hasDataStore = dataStores.length > 0;

	const uniqueSourceKinds = Array.from(
		new Set(resolveWorkflowRequiredSources(useCase.workflowBlueprint)),
	);
	const checks: UseCaseSimulationCheck[] = [
		evaluateReadinessCheck(readiness),
		...uniqueSourceKinds.map((sourceKind) =>
			evaluateSourceCheck({
				sourceKind,
				hasDocumentStore,
				hasCompletedDocumentIngest,
				hasRunningOrPendingDocumentIngest,
				hasGithubIndex,
				hasDataStore,
			}),
		),
		...evaluateSimulationChecks(useCase.workflowBlueprint.simulationChecks, readiness),
		...evaluateDeployChecks(useCase.workflowBlueprint.deployChecklist, readiness),
		...evaluateSuccessCriteriaChecks(useCase.workflowBlueprint.successCriteria),
	];

	const status = aggregateStatus(checks);
	return {
		useCaseId: args.useCaseId,
		status,
		summary: statusSummary(status),
		objective: useCase.workflowBlueprint.objective,
		readiness,
		checks,
		generatedAt: new Date().toISOString(),
	};
}
