"use client";

import {
	type AiStudioUseCaseId,
	RECODER_AI_STUDIO_USE_CASES,
	RECODER_STUDIO_FLAGSHIP_LOOP,
} from "@recoder/ecosystem-config";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect, useMemo, useState } from "react";
import { useUseCaseReadiness } from "../use-cases/use-use-case-readiness";

const FLAGSHIP_USE_CASE_ID = "agent-ops-platform";

type SimulationCheck = {
	id: string;
	label: string;
	status: "pass" | "warn" | "fail";
	details: string;
	actionPath: string | null;
};

type SimulationReport = {
	useCaseId: AiStudioUseCaseId;
	status: "pass" | "warn" | "fail";
	summary: string;
	objective: string;
	checks: SimulationCheck[];
	generatedAt: string;
};

type DeploymentSnapshot = {
	useCaseId: AiStudioUseCaseId;
	stage: "draft" | "canary" | "live";
	canaryPolicy?: {
		rolloutPercentage: number;
		audience: "all" | "internal" | "beta";
	};
	updatedAt: string;
	workspaceId: string | null;
	history: Array<{
		fromStage: "draft" | "canary" | "live" | null;
		toStage: "draft" | "canary" | "live";
		reason: string;
		changedAt: string;
		actorUserId: string;
	}>;
};

type DeploymentDiff = {
	fromChangedAt: string;
	toChangedAt: string;
	changes: string[];
};

export default function WorkflowOpsPage() {
	const flagshipUseCase = useMemo(
		() => RECODER_AI_STUDIO_USE_CASES.find((item) => item.id === FLAGSHIP_USE_CASE_ID),
		[],
	);
	const secondaryUseCases = useMemo(
		() => RECODER_AI_STUDIO_USE_CASES.filter((item) => item.id !== FLAGSHIP_USE_CASE_ID),
		[],
	);
	const allUseCases = useMemo(() => RECODER_AI_STUDIO_USE_CASES, []);
	const router = useRouter();
	const posthog = usePostHog();
	const { getUseCaseReadiness } = useUseCaseReadiness();
	const [bootstrappingUseCaseId, setBootstrappingUseCaseId] = useState<
		string | null
	>(null);
	const [simulatingUseCaseId, setSimulatingUseCaseId] = useState<string | null>(
		null,
	);
	const [simulationReport, setSimulationReport] = useState<SimulationReport | null>(
		null,
	);
	const [simulationError, setSimulationError] = useState<string | null>(null);
	const [deployment, setDeployment] = useState<DeploymentSnapshot | null>(null);
	const [deploymentDiff, setDeploymentDiff] = useState<DeploymentDiff | null>(null);
	const [deploymentError, setDeploymentError] = useState<string | null>(null);
	const [isDeploying, setIsDeploying] = useState(false);
	const [canaryRolloutPercentage, setCanaryRolloutPercentage] = useState(10);
	const [canaryAudience, setCanaryAudience] = useState<"all" | "internal" | "beta">(
		"beta",
	);

	if (!flagshipUseCase) {
		return null;
	}

	const readiness = getUseCaseReadiness(flagshipUseCase.id);

	const startUseCase = async (useCaseId: AiStudioUseCaseId, source: string) => {
		if (bootstrappingUseCaseId) return;
		const useCaseReadiness = getUseCaseReadiness(useCaseId);
		if (
			useCaseReadiness?.status === "setup_required" &&
			useCaseReadiness.actionPath
		) {
			router.push(useCaseReadiness.actionPath);
			return;
		}

		posthog?.capture("use_case_bootstrap_requested", {
			useCaseId,
			source,
		});
		setBootstrappingUseCaseId(useCaseId);
		try {
			const response = await fetch("/api/use-cases/bootstrap", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ useCaseId }),
			});
			if (!response.ok) {
				if (response.status === 409) {
					const conflictData = (await response.json()) as {
						readiness?: { actionPath?: string | null };
					};
					if (conflictData.readiness?.actionPath) {
						router.push(conflictData.readiness.actionPath);
						setBootstrappingUseCaseId(null);
						return;
					}
				}
				throw new Error(`Failed to bootstrap flow: ${response.status}`);
			}
			const data = (await response.json()) as {
				redirectPath?: string;
				starterTemplateApplied?: boolean;
			};
			if (!data.redirectPath) {
				throw new Error("Missing redirect path");
			}
			posthog?.capture("use_case_bootstrap_succeeded", {
				useCaseId,
				source,
				starterTemplateApplied: data.starterTemplateApplied ?? false,
			});
			router.push(data.redirectPath);
		} catch (error) {
			posthog?.capture("use_case_bootstrap_failed", {
				useCaseId,
				source,
			});
			console.error(error);
			setBootstrappingUseCaseId(null);
		}
	};

	const handleStartFlagship = async () => {
		await startUseCase(flagshipUseCase.id, "workflow_ops");
	};

	const runSimulation = async (useCaseId: AiStudioUseCaseId, source: string) => {
		if (simulatingUseCaseId) return;
		setSimulationError(null);
		setSimulatingUseCaseId(useCaseId);
		posthog?.capture("use_case_simulation_requested", { useCaseId, source });
		try {
			const response = await fetch("/api/use-cases/simulate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ useCaseId }),
			});
			if (!response.ok) {
				throw new Error(`Simulation failed: ${response.status}`);
			}
			const data = (await response.json()) as { report?: SimulationReport };
			if (!data.report) {
				throw new Error("Missing simulation report");
			}
			setSimulationReport(data.report);
			posthog?.capture("use_case_simulation_succeeded", {
				useCaseId,
				source,
				status: data.report.status,
				checkCount: data.report.checks.length,
			});
		} catch (error) {
			console.error(error);
			setSimulationError("Simulation failed. Please retry.");
			posthog?.capture("use_case_simulation_failed", { useCaseId, source });
		} finally {
			setSimulatingUseCaseId(null);
		}
	};

	useEffect(() => {
		const refreshDeployment = async () => {
			try {
				const response = await fetch(
					`/api/use-cases/deploy?useCaseId=${encodeURIComponent(flagshipUseCase.id)}`,
				);
				if (!response.ok) {
					return;
				}
				const data = (await response.json()) as {
					deployment?: DeploymentSnapshot;
					diff?: DeploymentDiff | null;
				};
				if (data.deployment) {
					setDeployment(data.deployment);
					setDeploymentDiff(data.diff ?? null);
					setCanaryRolloutPercentage(
						Math.min(
							100,
							Math.max(1, data.deployment.canaryPolicy?.rolloutPercentage ?? 10),
						),
					);
					setCanaryAudience(data.deployment.canaryPolicy?.audience ?? "beta");
				}
			} catch {
				// Best-effort read, no UI interruption.
			}
		};
		void refreshDeployment();
	}, [flagshipUseCase.id]);

	const deployAction = async (
		action: "create_draft" | "promote_canary" | "promote_live" | "rollback",
	) => {
		if (isDeploying) return;
		setDeploymentError(null);
		setIsDeploying(true);
		posthog?.capture("use_case_deployment_requested", {
			useCaseId: flagshipUseCase.id,
			action,
			source: "workflow_ops",
		});
		try {
			const response = await fetch("/api/use-cases/deploy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					useCaseId: flagshipUseCase.id,
					action,
					canaryPolicy:
						action === "promote_canary"
							? {
									rolloutPercentage: canaryRolloutPercentage,
									audience: canaryAudience,
								}
							: undefined,
				}),
			});
			const data = (await response.json()) as {
				deployment?: DeploymentSnapshot;
				diff?: DeploymentDiff | null;
				simulation?: SimulationReport;
				error?: string;
			};
			if (response.status === 409 && action === "promote_live" && data.simulation) {
				setSimulationReport(data.simulation);
				setSimulationError(
					data.error ??
						"Simulation must pass before promoting to live. Resolve blockers and retry.",
				);
				setDeploymentError(null);
				return;
			}
			if (!response.ok || !data.deployment) {
				throw new Error(data.error ?? `Deployment action failed: ${response.status}`);
			}
			setDeployment(data.deployment);
			setDeploymentDiff(data.diff ?? null);
			setCanaryRolloutPercentage(
				Math.min(100, Math.max(1, data.deployment.canaryPolicy?.rolloutPercentage ?? 10)),
			);
			setCanaryAudience(data.deployment.canaryPolicy?.audience ?? "beta");
			if (action === "promote_live") {
				setSimulationError(null);
			}
			posthog?.capture("use_case_deployment_succeeded", {
				useCaseId: flagshipUseCase.id,
				action,
				stage: data.deployment.stage,
				source: "workflow_ops",
			});
		} catch (error) {
			console.error(error);
			setDeploymentError(
				error instanceof Error
					? error.message
					: "Deployment update failed. Bootstrap a workspace first.",
			);
			posthog?.capture("use_case_deployment_failed", {
				useCaseId: flagshipUseCase.id,
				action,
				source: "workflow_ops",
			});
		} finally {
			setIsDeploying(false);
		}
	};

	return (
		<div className="px-6 py-6 md:px-10 md:py-8 text-text">
			<section className="rounded-xl border border-border/70 bg-surface/20 p-6 mb-6">
				<p className="text-[11px] uppercase tracking-[0.15em] text-primary-100">
					Recoder Studio Core
				</p>
				<h1 className="mt-1 text-[24px] font-semibold text-inverse">
					AI Workflow Builder + Runtime Ops
				</h1>
				<p className="mt-2 text-sm text-text/70 max-w-3xl">
					Use one control plane to design workflows, simulate behavior, deploy
					runtime agents, observe production reliability, and iterate fast.
				</p>
				<div className="mt-4 flex flex-wrap gap-2">
					{RECODER_STUDIO_FLAGSHIP_LOOP.map((step) => (
						<span
							key={step}
							className="rounded-md border border-primary-100/40 bg-primary-100/10 px-2 py-1 text-[11px] text-primary-100"
						>
							{step}
						</span>
					))}
				</div>
				<div className="mt-5 flex items-center gap-3">
					<button
						type="button"
						onClick={handleStartFlagship}
						disabled={bootstrappingUseCaseId !== null}
						className="rounded-lg border border-primary-100/50 bg-primary-100/10 px-4 py-2 text-xs font-medium text-primary-100 hover:bg-primary-100/20 disabled:opacity-60 disabled:cursor-not-allowed"
					>
						{bootstrappingUseCaseId === flagshipUseCase.id
							? "Starting flagship workspace..."
							: "Start Flagship Workflow"}
					</button>
					<button
						type="button"
						onClick={() => runSimulation(flagshipUseCase.id, "workflow_ops")}
						disabled={simulatingUseCaseId !== null}
						className="rounded-lg border border-border/70 bg-surface/20 px-4 py-2 text-xs font-medium text-text hover:bg-surface/35 disabled:opacity-60 disabled:cursor-not-allowed"
					>
						{simulatingUseCaseId === flagshipUseCase.id
							? "Running simulation..."
							: "Run Simulation"}
					</button>
					{readiness ? (
						<p
							className={`text-xs ${
								readiness.status === "ready"
									? "text-emerald-300"
									: readiness.status === "ingesting"
										? "text-amber-300"
										: "text-orange-300"
							}`}
						>
							{readiness.message}
						</p>
					) : (
						<p className="text-xs text-text/60">Checking readiness...</p>
					)}
				</div>
				{simulationError ? (
					<p className="mt-3 text-xs text-red-300">{simulationError}</p>
				) : null}
				{simulationReport ? (
					<div className="mt-4 rounded-lg border border-border/70 bg-surface/15 p-4">
						<div className="flex items-center justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.1em] text-text/60">
									Simulation Report
								</p>
								<p className="text-sm text-text mt-1">
									{simulationReport.summary}
								</p>
							</div>
							<span
								className={`rounded-md px-2 py-1 text-[11px] font-medium ${
									simulationReport.status === "pass"
										? "bg-emerald-500/20 text-emerald-300"
										: simulationReport.status === "warn"
											? "bg-amber-500/20 text-amber-300"
											: "bg-red-500/20 text-red-300"
								}`}
							>
								{simulationReport.status.toUpperCase()}
							</span>
						</div>
						<p className="mt-2 text-xs text-text/70">
							Objective: {simulationReport.objective}
						</p>
						<div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
							{simulationReport.checks.slice(0, 8).map((check) => (
								<div
									key={check.id}
									className="rounded-md border border-border/60 bg-surface/20 px-3 py-2"
								>
									<p className="text-[11px] text-text/65">{check.label}</p>
									<p className="text-xs text-text mt-1 line-clamp-2">
										{check.details}
									</p>
									{check.actionPath ? (
										<button
											type="button"
											onClick={() => router.push(check.actionPath as string)}
											className="mt-2 text-[11px] text-primary-100 hover:underline"
										>
											Open setup
										</button>
									) : null}
								</div>
							))}
						</div>
					</div>
				) : null}
			</section>

			<section className="rounded-xl border border-border/70 bg-surface/20 p-6 mb-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-[11px] uppercase tracking-[0.12em] text-text/60">
							Deploy Plane
						</p>
						<h2 className="text-[18px] font-semibold text-inverse mt-1">
							Workflow Release Controls
						</h2>
						<p className="text-xs text-text/70 mt-1">
							Promote your workflow safely across draft, canary, and live stages.
						</p>
					</div>
					<span
						className={`rounded-md px-2 py-1 text-[11px] font-medium ${
							deployment?.stage === "live"
								? "bg-emerald-500/20 text-emerald-300"
								: deployment?.stage === "canary"
									? "bg-amber-500/20 text-amber-300"
									: "bg-sky-500/20 text-sky-300"
						}`}
					>
						Stage: {(deployment?.stage ?? "draft").toUpperCase()}
					</span>
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					<div className="flex items-center gap-2 rounded-md border border-border/60 bg-surface/15 px-2 py-1">
						<label htmlFor="canary-rollout" className="text-[11px] text-text/70">
							Canary %
						</label>
						<input
							id="canary-rollout"
							type="number"
							min={1}
							max={100}
							step={1}
							value={canaryRolloutPercentage}
							onChange={(event) => {
								const next = Number.parseInt(event.target.value, 10);
								setCanaryRolloutPercentage(
									Number.isNaN(next) ? 10 : Math.min(100, Math.max(1, next)),
								);
							}}
							className="w-16 rounded border border-border/70 bg-surface/20 px-2 py-1 text-[11px] text-text"
						/>
						<select
							value={canaryAudience}
							onChange={(event) =>
								setCanaryAudience(
									event.target.value as "all" | "internal" | "beta",
								)
							}
							className="rounded border border-border/70 bg-surface/20 px-2 py-1 text-[11px] text-text"
						>
							<option value="beta">beta</option>
							<option value="internal">internal</option>
							<option value="all">all</option>
						</select>
					</div>
					<button
						type="button"
						onClick={() => deployAction("create_draft")}
						disabled={isDeploying}
						className="rounded-md border border-border/70 bg-surface/20 px-3 py-1.5 text-[11px] text-text hover:bg-surface/35 disabled:opacity-60"
					>
						Set Draft
					</button>
					<button
						type="button"
						onClick={() => deployAction("promote_canary")}
						disabled={isDeploying}
						className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300 hover:bg-amber-500/20 disabled:opacity-60"
					>
						Promote Canary
					</button>
					<button
						type="button"
						onClick={() => deployAction("promote_live")}
						disabled={isDeploying}
						className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
					>
						Promote Live
					</button>
					<button
						type="button"
						onClick={() => deployAction("rollback")}
						disabled={isDeploying}
						className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300 hover:bg-red-500/20 disabled:opacity-60"
					>
						Rollback to Draft
					</button>
				</div>
				<p className="mt-2 text-[11px] text-text/65">
					Active canary policy:{" "}
					{deployment?.canaryPolicy?.rolloutPercentage ?? canaryRolloutPercentage}% /{" "}
					{deployment?.canaryPolicy?.audience ?? canaryAudience}
				</p>
				{deploymentError ? (
					<p className="mt-3 text-xs text-red-300">{deploymentError}</p>
				) : null}
				{deployment?.history?.length ? (
					<div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
						{deployment.history.slice(-4).reverse().map((item, index) => (
							<div
								key={`${item.changedAt}-${index}`}
								className="rounded-md border border-border/60 bg-surface/20 px-3 py-2"
							>
								<p className="text-[11px] text-text/65">
									{item.fromStage ? item.fromStage.toUpperCase() : "NONE"} {"→"}{" "}
									{item.toStage.toUpperCase()}
								</p>
								<p className="text-xs text-text mt-1">{item.reason}</p>
								<p className="text-[11px] text-text/55 mt-1">{item.changedAt}</p>
							</div>
						))}
					</div>
				) : null}
				{deploymentDiff ? (
					<div className="mt-4 rounded-md border border-border/60 bg-surface/15 p-3">
						<p className="text-[11px] uppercase tracking-[0.1em] text-text/60">
							Deployment Diff
						</p>
						<p className="mt-1 text-[11px] text-text/60">
							{deploymentDiff.fromChangedAt} {"→"} {deploymentDiff.toChangedAt}
						</p>
						<ul className="mt-2 space-y-1">
							{deploymentDiff.changes.map((change, index) => (
								<li key={`${change}-${index}`} className="text-xs text-text/80">
									{change}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</section>

			<section>
				<h2 className="text-[18px] font-semibold mb-3">Secondary Playbooks</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
					{secondaryUseCases.map((useCase) => (
						<button
							key={useCase.id}
							type="button"
							onClick={() =>
								startUseCase(useCase.id, "workflow_ops_secondary")
							}
							disabled={bootstrappingUseCaseId !== null}
							className="rounded-[10px] border border-border/70 bg-surface/10 p-4 text-left transition-colors hover:bg-surface/30"
						>
							<p className="text-sm font-semibold text-text">{useCase.title}</p>
							<p className="text-xs text-text/65 mt-1">{useCase.summary}</p>
							{bootstrappingUseCaseId === useCase.id ? (
								<p className="text-[11px] text-primary-100 mt-2">
									Starting workspace...
								</p>
							) : null}
						</button>
					))}
				</div>
			</section>

			<section className="mt-6">
				<h2 className="text-[18px] font-semibold mb-3">Preflight Simulations</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
					{allUseCases.map((useCase) => (
						<div
							key={`simulate-${useCase.id}`}
							className="rounded-[10px] border border-border/70 bg-surface/10 p-4"
						>
							<p className="text-sm font-semibold text-text">{useCase.title}</p>
							<p className="text-xs text-text/65 mt-1 line-clamp-2">
								{useCase.workflowBlueprint.objective}
							</p>
							<button
								type="button"
								onClick={() =>
									runSimulation(useCase.id, "workflow_ops_preflight_grid")
								}
								disabled={simulatingUseCaseId !== null}
								className="mt-3 rounded-md border border-border/70 bg-surface/20 px-3 py-1.5 text-[11px] text-text hover:bg-surface/35 disabled:opacity-60 disabled:cursor-not-allowed"
							>
								{simulatingUseCaseId === useCase.id
									? "Running..."
									: "Run Preflight"}
							</button>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
