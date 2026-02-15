import { RECODER_AI_STUDIO_USE_CASES } from "@recoder/ecosystem-config";
import { eq } from "drizzle-orm";
import { db, workspaces } from "@/db";
import { evaluateUseCaseReadinessForTeam } from "@/lib/use-cases/evaluate-readiness";

type DashboardItem = {
	useCaseId: string;
	title: string;
	status: "ready" | "ingesting" | "setup_required";
	message: string;
	actionPath: string | null;
	actionLabel: string | null;
	launchCount: number;
};

type DashboardSummary = {
	ready: number;
	ingesting: number;
	setupRequired: number;
	totalLaunches: number;
	recentLaunches24h: number;
};

function isWithinLast24Hours(date: Date) {
	return Date.now() - date.getTime() <= 24 * 60 * 60 * 1000;
}

export async function getUseCaseDashboardForTeam(teamDbId: number): Promise<{
	readiness: DashboardItem[];
	summary: DashboardSummary;
}> {
	const [readinessByUseCase, teamWorkspaces] = await Promise.all([
		evaluateUseCaseReadinessForTeam(teamDbId),
		db
			.select({ metadata: workspaces.metadata })
			.from(workspaces)
			.where(eq(workspaces.teamDbId, teamDbId)),
	]);

	const launchCountByUseCase = teamWorkspaces.reduce<Record<string, number>>(
		(acc, workspace) => {
			const useCaseId = workspace.metadata.starterTemplate?.useCaseId;
			if (!useCaseId) {
				return acc;
			}
			acc[useCaseId] = (acc[useCaseId] ?? 0) + 1;
			return acc;
		},
		{},
	);

	const recentLaunches24h = teamWorkspaces.reduce((count, workspace) => {
		const createdAtIso = workspace.metadata.starterTemplate?.createdAt;
		if (!createdAtIso) {
			return count;
		}
		const parsedDate = new Date(createdAtIso);
		if (Number.isNaN(parsedDate.getTime())) {
			return count;
		}
		return isWithinLast24Hours(parsedDate) ? count + 1 : count;
	}, 0);

	const readinessList: DashboardItem[] = RECODER_AI_STUDIO_USE_CASES.map(
		(useCase) => {
			const readiness = readinessByUseCase[useCase.id];
			return {
				useCaseId: useCase.id,
				title: useCase.title,
				status: readiness.status,
				message: readiness.message,
				actionPath: readiness.actionPath,
				actionLabel: readiness.actionLabel,
				launchCount: launchCountByUseCase[useCase.id] ?? 0,
			};
		},
	);

	return {
		readiness: readinessList,
		summary: {
			ready: readinessList.filter((item) => item.status === "ready").length,
			ingesting: readinessList.filter((item) => item.status === "ingesting")
				.length,
			setupRequired: readinessList.filter(
				(item) => item.status === "setup_required",
			).length,
			totalLaunches: readinessList.reduce(
				(total, item) => total + item.launchCount,
				0,
			),
			recentLaunches24h,
		},
	};
}
