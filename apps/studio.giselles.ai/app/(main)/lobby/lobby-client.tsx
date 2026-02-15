"use client";

import { Blocks, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { ActionCard } from "./components/action-card";
import { AppCard } from "./components/app-card";
import { SubTabs } from "./components/sub-tabs";
import { TopLightOverlay } from "./components/top-light-overlay";
import { TutorialVideoSection } from "./components/tutorial-video-section";
import { WorkflowCard } from "./components/workflow-card";
import { GreetingHeading } from "./greeting-heading";
import {
	type AiStudioUseCaseId,
	RECODER_AI_STUDIO_USE_CASES,
	RECODER_STUDIO_FLAGSHIP_LOOP,
} from "@recoder/ecosystem-config";
import { useUseCaseReadiness } from "../use-cases/use-use-case-readiness";

interface LobbyClientProps {
	username: string;
}

export function LobbyClient({ username }: LobbyClientProps) {
	const [activeTab, setActiveTab] = useState<"apps" | "workflow">("apps");
	const [activeAppTab, setActiveAppTab] = useState<string>("Recent");
	const [activeWorkflowTab, setActiveWorkflowTab] = useState<string>("Recent");
	const router = useRouter();
	const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
	const [bootstrappingUseCaseId, setBootstrappingUseCaseId] = useState<
		string | null
	>(null);
	const { getUseCaseReadiness, isLoading: isReadinessLoading } =
		useUseCaseReadiness();
	const posthog = usePostHog();

	// TODO: Fetch from actual data source
	const hasRecentApps = false; // Whether user has used apps before
	const hasRecentWorkflows = false; // Whether user has used workflows before

	const featuredApps = [
		{ title: "AI Writing Assistant", appsCount: 3 },
		{ title: "Data Analyzer", appsCount: 2 },
		{ title: "Customer Support Bot", appsCount: 4 },
	];

	const recentApps = [
		{ title: "Recent App 1", appsCount: 1 },
		{ title: "Recent App 2", appsCount: 2 },
	];

	const featuredWorkflows = [
		{ id: "wf1", name: "Content Generation Workflow", updatedAt: new Date() },
		{ id: "wf2", name: "Data Processing Pipeline", updatedAt: new Date() },
		{ id: "wf3", name: "Customer Support Automation", updatedAt: new Date() },
	];

	const recentWorkflows = [
		{ id: "rwf1", name: "Recent Workflow 1", updatedAt: new Date() },
		{ id: "rwf2", name: "Recent Workflow 2", updatedAt: new Date() },
	];

	const handleCreateNewAgent = async () => {
		if (isCreatingWorkspace) return;
		setIsCreatingWorkspace(true);
		try {
			const response = await fetch("/api/workspaces", { method: "POST" });
			if (!response.ok) {
				throw new Error(`Failed to create workspace: ${response.status}`);
			}

			const data = (await response.json()) as { redirectPath?: string };
			if (!data.redirectPath) {
				throw new Error("Missing redirect path");
			}

			router.push(data.redirectPath);
		} catch (error) {
			console.error(error);
			setIsCreatingWorkspace(false);
		}
	};

	const handleStartFlagshipPath = () => {
		router.push("/workflow-ops");
	};

	const handleUseCaseBootstrap = async (useCaseId: AiStudioUseCaseId) => {
		if (bootstrappingUseCaseId !== null) return;
		const readiness = getUseCaseReadiness(useCaseId);
		if (readiness?.status === "setup_required" && readiness.actionPath) {
			posthog?.capture("use_case_bootstrap_blocked", {
				useCaseId,
				source: "lobby",
				reason: "setup_required",
			});
			router.push(readiness.actionPath);
			return;
		}
		posthog?.capture("use_case_bootstrap_requested", {
			useCaseId,
			source: "lobby",
		});
		setBootstrappingUseCaseId(useCaseId);
		try {
			const response = await fetch("/api/use-cases/bootstrap", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ useCaseId }),
			});
			if (!response.ok) {
				if (response.status === 409) {
					const conflictData = (await response.json()) as {
						readiness?: { actionPath?: string | null };
					};
					if (conflictData.readiness?.actionPath) {
						posthog?.capture("use_case_bootstrap_blocked", {
							useCaseId,
							source: "lobby",
							reason: "server_setup_required",
						});
						router.push(conflictData.readiness.actionPath);
						setBootstrappingUseCaseId(null);
						return;
					}
				}
				throw new Error(`Failed to bootstrap use case: ${response.status}`);
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
				source: "lobby",
				starterTemplateApplied: data.starterTemplateApplied ?? false,
			});
			router.push(data.redirectPath);
		} catch (error) {
			posthog?.capture("use_case_bootstrap_failed", {
				useCaseId,
				source: "lobby",
			});
			console.error(error);
			setBootstrappingUseCaseId(null);
		}
	};

	return (
		<div className="flex flex-col gap-8">
			{/* Greeting */}
			<div className="flex justify-center">
				<GreetingHeading username={username} />
			</div>

			{/* Tutorial Video Section */}
			<TutorialVideoSection
				banners={[
					{
						label: "New Feature",
						title: "Stage is here",
						description:
							"Try powerful agents instantly. Ask anything, get answers.",
						imageSrc: "/stage.jpg",
						imageAlt: "Stage background",
						ctaButtons: [
							{
								label: "Watch Now",
								onClick: () => {},
								variant: "primary",
							},
							{
								label: "Learn More",
								onClick: () => {},
								variant: "secondary",
							},
						],
					},
					{
						label: "New Model",
						title: "Meet our latest AI",
						description:
							"More accurate, faster, and more capable than ever before.",
						imageSrc: "/model.jpg",
						imageAlt: "Model background",
						ctaButtons: [
							{
								label: "Learn More",
								onClick: () => {
									window.open(
										"https://giselles.ai/blog/giselle-now-supports-openai-gpt-5-series",
										"_blank",
									);
								},
								variant: "primary",
							},
						],
					},
				]}
			/>

			{/* Where to start today? */}
			<section className="relative pt-6">
				<TopLightOverlay />
				<h2
					className="text-[20px] font-medium mb-6 text-center text-text relative z-10"
					style={{
						textShadow:
							"0 0 10px rgba(192, 219, 254, 0.3), 0 0 20px rgba(192, 219, 254, 0.2), 0 0 30px rgba(192, 219, 254, 0.1)",
					}}
				>
					Where to start today?
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto relative z-10">
					<ActionCard
						icon={Blocks}
						title="Start Flagship Workflow"
						description="Design -> Simulate -> Deploy -> Observe -> Iterate"
						onClick={handleStartFlagshipPath}
					/>
					<ActionCard
						icon={SparklesIcon}
						title="Create Blank Workspace"
						description="Start from scratch without a playbook template"
						onClick={handleCreateNewAgent}
						disabled={isCreatingWorkspace}
					/>
				</div>
			</section>

			<section className="rounded-[12px] border border-border/60 bg-surface/20 p-5">
				<h2 className="text-[18px] font-semibold text-text mb-2">
					Flagship Use Case
				</h2>
				<p className="text-sm text-text/65 mb-3">
					Recoder Studio is the execution control plane for production AI workflows.
				</p>
				<div className="flex flex-wrap gap-2">
					{RECODER_STUDIO_FLAGSHIP_LOOP.map((step) => (
						<span
							key={step}
							className="rounded-md border border-primary-100/40 bg-primary-100/10 px-2 py-1 text-[11px] text-primary-100"
						>
							{step}
						</span>
					))}
				</div>
			</section>

			<section className="rounded-[12px] border border-border/60 bg-surface/20 p-5">
				<div className="mb-4 flex items-center justify-between gap-4">
					<div>
						<h2 className="text-[18px] font-semibold text-text">
							Workflow Playbooks
						</h2>
						<p className="text-sm text-text/60">
							Use these as reusable templates under the flagship workflow engine.
						</p>
					</div>
					<button
						type="button"
						onClick={() => router.push("/workspaces")}
						className="rounded-[8px] border border-border px-3 py-2 text-xs text-text hover:bg-surface/40 transition-colors"
					>
						View all workspaces
					</button>
				</div>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
					{RECODER_AI_STUDIO_USE_CASES.map((useCase) => (
						<button
							key={useCase.id}
							type="button"
							onClick={() => handleUseCaseBootstrap(useCase.id)}
							disabled={bootstrappingUseCaseId !== null}
							className="rounded-[10px] border border-border/70 bg-surface/10 p-4 text-left transition-colors hover:bg-surface/30 disabled:opacity-60 disabled:cursor-not-allowed"
						>
							<div className="mb-2 flex items-center justify-between gap-2">
								<p className="text-sm font-semibold text-text">{useCase.title}</p>
								<span className="rounded border border-border/70 px-2 py-0.5 text-[10px] uppercase text-text/70">
									{useCase.targetTeam}
								</span>
							</div>
							<p className="text-xs text-text/70 mb-2">{useCase.summary}</p>
							<p className="text-xs text-text/60 line-clamp-2">{useCase.starterPrompt}</p>
							{(() => {
								const readiness = getUseCaseReadiness(useCase.id);
								if (!readiness) {
									return isReadinessLoading ? (
										<p className="mt-2 text-[11px] text-text/60">
											Checking readiness...
										</p>
									) : null;
								}
								const statusLabel =
									readiness.status === "ready"
										? "Ready"
										: readiness.status === "ingesting"
											? "Ingesting"
											: "Setup required";
								const statusColorClass =
									readiness.status === "ready"
										? "text-emerald-300"
										: readiness.status === "ingesting"
											? "text-amber-300"
											: "text-orange-300";
								return (
									<div className="mt-2">
										<p className={`text-[11px] ${statusColorClass}`}>
											{statusLabel}
										</p>
										<p className="text-[11px] text-text/60 line-clamp-2">
											{readiness.message}
										</p>
									</div>
								);
							})()}
							{bootstrappingUseCaseId === useCase.id ? (
								<p className="mt-2 text-[11px] text-primary-100">
									Creating workspace...
								</p>
							) : null}
						</button>
					))}
				</div>
			</section>

			{/* Use Apps / Create workflow */}
			<section className="mb-6">
				{/* Tabs */}
				<div className="mb-8">
					<div className="flex items-center px-0 py-0 border-b border-border">
						<div className="flex items-center w-full">
							{["Use Apps", "Create workflow"].map((tab) => {
								const isActive =
									(tab === "Use Apps" && activeTab === "apps") ||
									(tab === "Create workflow" && activeTab === "workflow");
								const tabKey = tab === "Use Apps" ? "apps" : "workflow";
								return (
									<button
										key={tab}
										type="button"
										onClick={() => setActiveTab(tabKey as "apps" | "workflow")}
										className={`flex-1 text-[16px] font-sans font-medium transition-colors px-2 py-2 relative rounded-md ${
											isActive
												? "text-primary-100 [text-shadow:0px_0px_20px_#0087f6] after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-0 after:h-[2px] after:bg-primary-100"
												: "text-tabs-inactive-text hover:text-inverse hover:after:content-[''] hover:after:absolute hover:after:left-0 hover:after:right-0 hover:after:bottom-0 hover:after:h-[2px] hover:after:bg-primary-100"
										}`}
									>
										{tab}
									</button>
								);
							})}
						</div>
					</div>
				</div>

				{/* Tab Content */}
				{activeTab === "apps" && (
					<>
						{/* Sub-tabs - Only show if user has used apps before */}
						{hasRecentApps && (
							<SubTabs
								tabs={["Recent", "Featured"]}
								activeTab={activeAppTab}
								onTabChange={setActiveAppTab}
							/>
						)}

						{/* Sub-tab Content */}
						<div className="flex flex-wrap gap-6">
							{(hasRecentApps && activeAppTab === "Recent"
								? recentApps
								: featuredApps
							).map((item, index) => (
								<AppCard key={item.title} title={item.title} index={index} />
							))}
						</div>
					</>
				)}

				{activeTab === "workflow" && (
					<>
						{/* Sub-tabs - Only show if user has used workflows before */}
						{hasRecentWorkflows && (
							<SubTabs
								tabs={["Recent", "Featured"]}
								activeTab={activeWorkflowTab}
								onTabChange={setActiveWorkflowTab}
							/>
						)}

						{/* Sub-tab Content */}
						<div className="flex flex-wrap gap-4">
							{(hasRecentWorkflows && activeWorkflowTab === "Recent"
								? recentWorkflows
								: featuredWorkflows
							).map((workflow) => {
								const isFeatured =
									!hasRecentWorkflows || activeWorkflowTab === "Featured";
								return (
									<WorkflowCard
										key={workflow.id}
										id={workflow.id}
										name={workflow.name}
										updatedAt={workflow.updatedAt}
										isFeatured={isFeatured}
									/>
								);
							})}
						</div>
					</>
				)}
			</section>
		</div>
	);
}
