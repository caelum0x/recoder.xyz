import { RECODER_AI_STUDIO_USE_CASES } from "@recoder/ecosystem-config";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { db, workspaces } from "@/db";
import { evaluateUseCaseReadinessForTeam } from "@/lib/use-cases/evaluate-readiness";
import { fetchCurrentTeam } from "@/services/teams";
import { Card } from "../components/card";

const statusClassNameByType = {
	ready: "text-emerald-300",
	ingesting: "text-amber-300",
	setup_required: "text-orange-300",
} as const;

const statusLabelByType = {
	ready: "Ready",
	ingesting: "Ingesting",
	setup_required: "Setup required",
} as const;

export async function UseCaseReadinessPanel() {
	const team = await fetchCurrentTeam();
	const [readinessByUseCase, teamWorkspaces] = await Promise.all([
		evaluateUseCaseReadinessForTeam(team.dbId),
		db
			.select({
				metadata: workspaces.metadata,
			})
			.from(workspaces)
			.where(eq(workspaces.teamDbId, team.dbId)),
	]);

	const templateLaunchCount = teamWorkspaces.reduce<Record<string, number>>(
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
	const totalLaunches = Object.values(templateLaunchCount).reduce(
		(total, count) => total + count,
		0,
	);
	const useCaseReadinessList = RECODER_AI_STUDIO_USE_CASES.map(
		(useCase) => readinessByUseCase[useCase.id],
	);
	const readyCount = useCaseReadinessList.filter(
		(readiness) => readiness.status === "ready",
	).length;
	const ingestingCount = useCaseReadinessList.filter(
		(readiness) => readiness.status === "ingesting",
	).length;
	const setupRequiredCount = useCaseReadinessList.filter(
		(readiness) => readiness.status === "setup_required",
	).length;

	return (
		<Card
			title="Workflow Ops Readiness"
			description="Production readiness and launch footprint for Studio workflow playbooks."
		>
			<div className="grid gap-3">
				<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
					<div className="rounded-md border border-border/80 bg-surface/15 px-3 py-2">
						<p className="text-[11px] text-text/60">Ready</p>
						<p className="text-sm font-medium text-emerald-300">{readyCount}</p>
					</div>
					<div className="rounded-md border border-border/80 bg-surface/15 px-3 py-2">
						<p className="text-[11px] text-text/60">Ingesting</p>
						<p className="text-sm font-medium text-amber-300">
							{ingestingCount}
						</p>
					</div>
					<div className="rounded-md border border-border/80 bg-surface/15 px-3 py-2">
						<p className="text-[11px] text-text/60">Setup Required</p>
						<p className="text-sm font-medium text-orange-300">
							{setupRequiredCount}
						</p>
					</div>
					<div className="rounded-md border border-border/80 bg-surface/15 px-3 py-2">
						<p className="text-[11px] text-text/60">Template Launches</p>
						<p className="text-sm font-medium text-primary-100">
							{totalLaunches}
						</p>
					</div>
				</div>

				{RECODER_AI_STUDIO_USE_CASES.map((useCase) => {
					const readiness = readinessByUseCase[useCase.id];
					const launchCount = templateLaunchCount[useCase.id] ?? 0;
					return (
						<div
							key={useCase.id}
							className="rounded-lg border border-border/80 bg-surface/20 px-3 py-2"
						>
							<div className="flex items-center justify-between gap-2">
								<p className="text-sm font-medium text-inverse">{useCase.title}</p>
								<div className="flex items-center gap-3">
									<p className="text-[11px] text-text/60">
										Launched {launchCount} time{launchCount === 1 ? "" : "s"}
									</p>
									<p
										className={`text-[11px] font-medium ${statusClassNameByType[readiness.status]}`}
									>
										{statusLabelByType[readiness.status]}
									</p>
								</div>
							</div>
							<p className="text-xs text-text/60 mt-1">{readiness.message}</p>
							{readiness.actionPath ? (
								<Link
									href={readiness.actionPath}
									className="inline-flex mt-2 text-xs text-primary-100 hover:underline"
								>
									{readiness.actionLabel ?? "Resolve"}
								</Link>
							) : null}
						</div>
					);
				})}
			</div>
		</Card>
	);
}
