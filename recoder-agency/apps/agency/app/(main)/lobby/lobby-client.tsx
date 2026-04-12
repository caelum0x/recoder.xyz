"use client";

import {
	Blocks,
	BookOpen,
	Compass,
	Lightbulb,
	Play,
	SparklesIcon,
	StarIcon,
	Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFeaturedItem } from "./actions";
import { ActionCard } from "./components/action-card";
import { AppCard } from "./components/app-card";
import { SubTabs } from "./components/sub-tabs";
import { TopLightOverlay } from "./components/top-light-overlay";
import { TutorialVideoSection } from "./components/tutorial-video-section";
import { WorkflowCard } from "./components/workflow-card";
import { GreetingHeading } from "./greeting-heading";

interface LobbyClientProps {
	username: string;
	recentApps?: { title: string; appsCount: number }[];
	recentWorkflows?: { id: string; name: string; updatedAt: Date }[];
	featuredApps?: { title: string; appsCount: number }[];
	featuredWorkflows?: { id: string; name: string; updatedAt: Date }[];
	isAdmin?: boolean;
	teamDbId?: number;
	featuredIds?: Record<string, boolean>;
}

export function LobbyClient(props: LobbyClientProps) {
	const { username, isAdmin = false, teamDbId } = props;
	const [activeTab, setActiveTab] = useState<"apps" | "workflow">("apps");
	const [activeAppTab, setActiveAppTab] = useState<string>("Recent");
	const [activeWorkflowTab, setActiveWorkflowTab] = useState<string>("Recent");
	const router = useRouter();
	const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
	const [isTogglingFeatured, startFeaturedTransition] = useTransition();

	const hasRecentApps = (props.recentApps ?? []).length > 0;
	const hasRecentWorkflows = (props.recentWorkflows ?? []).length > 0;
	const recentApps = props.recentApps ?? [];
	const recentWorkflows = props.recentWorkflows ?? [];

	const featuredApps = props.featuredApps ?? [];
	const featuredWorkflows = props.featuredWorkflows ?? [];
	const hasFeaturedApps = featuredApps.length > 0;
	const hasFeaturedWorkflows = featuredWorkflows.length > 0;
	const [localFeaturedIds, setLocalFeaturedIds] = useState<
		Record<string, boolean>
	>(props.featuredIds ?? {});

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

	const handleAskReview = () => {
		router.push("/stage");
	};

	const handleToggleFeatured = (
		itemType: "app" | "workflow",
		itemId: string,
	) => {
		if (!teamDbId) return;
		const key = `${itemType}:${itemId}`;
		const wasFeatured = !!localFeaturedIds[key];

		setLocalFeaturedIds((prev) => {
			const next = { ...prev };
			if (wasFeatured) {
				delete next[key];
			} else {
				next[key] = true;
			}
			return next;
		});

		startFeaturedTransition(async () => {
			try {
				await toggleFeaturedItem(teamDbId, itemType, itemId);
			} catch (error) {
				console.error("Failed to toggle featured:", error);
				// Revert optimistic update
				setLocalFeaturedIds((prev) => {
					const next = { ...prev };
					if (wasFeatured) {
						next[key] = true;
					} else {
						delete next[key];
					}
					return next;
				});
			}
		});
	};

	const isItemFeatured = (itemType: "app" | "workflow", itemId: string) => {
		return !!localFeaturedIds[`${itemType}:${itemId}`];
	};

	return (
		<div className="flex flex-col gap-6 sm:gap-8 px-4 sm:px-0">
			{/* Greeting */}
			<div className="flex justify-center">
				<GreetingHeading username={username} />
			</div>

			{/* Tutorial Video Section */}
			<TutorialVideoSection
				banners={[
					{
						label: "Get Started",
						title: "Build AI workflows",
						description:
							"Create visual AI workflows with drag-and-drop. Connect models, tools, and data sources.",
						imageSrc: "/stage.jpg",
						imageAlt: "Stage background",
						ctaButtons: [
							{
								label: "Create Workflow",
								onClick: handleCreateNewAgent,
								variant: "primary",
							},
							{
								label: "Browse Apps",
								onClick: handleAskReview,
								variant: "secondary",
							},
						],
					},
				]}
			/>

			{/* Featured Section */}
			{(hasFeaturedApps || hasFeaturedWorkflows) && (
				<section className="relative pt-4">
					<div className="flex items-center gap-2 mb-4">
						<StarIcon className="size-5 text-amber-400 fill-amber-400" />
						<h2 className="text-lg font-semibold text-text">Featured</h2>
					</div>
					{hasFeaturedApps && (
						<div className="mb-4">
							<h3 className="text-sm font-medium text-text-muted mb-3">
								Apps
							</h3>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
								{featuredApps.map((item, index) => (
									<div key={item.title} className="relative">
										<div className="absolute -top-2 -right-2 z-20">
											<StarIcon className="size-4 text-amber-400 fill-amber-400" />
										</div>
										<AppCard
											title={item.title}
											index={index}
										/>
									</div>
								))}
							</div>
						</div>
					)}
					{hasFeaturedWorkflows && (
						<div>
							<h3 className="text-sm font-medium text-text-muted mb-3">
								Workflows
							</h3>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
								{featuredWorkflows.map((workflow) => (
									<div key={workflow.id} className="relative">
										<div className="absolute -top-2 -right-2 z-20">
											<StarIcon className="size-4 text-amber-400 fill-amber-400" />
										</div>
										<WorkflowCard
											id={workflow.id}
											name={workflow.name}
											updatedAt={workflow.updatedAt}
											isFeatured
										/>
									</div>
								))}
							</div>
						</div>
					)}
				</section>
			)}

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
						icon={SparklesIcon}
						title="Ask / Review anything"
						description="Get answers and review content"
						onClick={handleAskReview}
					/>
					<ActionCard
						icon={Blocks}
						title="Create new agent"
						description="Building an Agent from Scratch"
						onClick={handleCreateNewAgent}
						disabled={isCreatingWorkspace}
					/>
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
												? "text-primary-100 [text-shadow:0px_0px_20px_var(--color-primary-100)] after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-0 after:h-[2px] after:bg-primary-100"
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
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
							{(hasRecentApps && activeAppTab === "Recent"
								? recentApps
								: featuredApps
							).map((item, index) => (
								<div key={item.title} className="relative group/feature">
									<AppCard title={item.title} index={index} />
									{isAdmin && (
										<button
											type="button"
											onClick={() =>
												handleToggleFeatured("app", item.title)
											}
											disabled={isTogglingFeatured}
											className="absolute top-1 right-1 z-30 p-1.5 rounded-full bg-background/80 border border-border opacity-0 group-hover/feature:opacity-100 transition-opacity hover:bg-bg-hover disabled:opacity-50"
											aria-label={
												isItemFeatured("app", item.title)
													? "Remove from featured"
													: "Feature this app"
											}
										>
											<StarIcon
												className={`size-3.5 transition-colors ${
													isItemFeatured("app", item.title)
														? "text-amber-400 fill-amber-400"
														: "text-text-muted"
												}`}
											/>
										</button>
									)}
								</div>
							))}
						</div>

						{/* Empty state */}
						{!hasRecentApps && featuredApps.length === 0 && (
							<div className="py-10">
								{/* Welcome message */}
								<div className="text-center mb-8">
									<div className="w-14 h-14 rounded-2xl bg-primary-100/10 flex items-center justify-center mb-4 mx-auto">
										<Lightbulb className="w-7 h-7 text-primary-100/60" />
									</div>
									<h3 className="text-xl font-semibold text-inverse mb-2">
										Your apps will live here
									</h3>
									<p className="text-sm text-text/60 max-w-md mx-auto">
										Apps are published workflows that anyone on your team can
										run. Create a workflow first, then publish it as an app.
									</p>
								</div>

								{/* Quick-start cards */}
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
									<button
										type="button"
										onClick={handleCreateNewAgent}
										disabled={isCreatingWorkspace}
										className="group text-left p-5 rounded-xl bg-white/[0.02] border-[0.5px] border-border hover:border-primary-100/40 transition-all duration-200 disabled:opacity-50"
									>
										<div className="w-9 h-9 rounded-lg bg-primary-100/10 flex items-center justify-center mb-3 group-hover:bg-primary-100/20 transition-colors">
											<Workflow className="w-5 h-5 text-primary-100" />
										</div>
										<h4 className="text-sm font-medium text-inverse mb-1">
											Create a Workflow
										</h4>
										<p className="text-xs text-text/50">
											Build a visual AI workflow from scratch with
											drag-and-drop.
										</p>
									</button>

									<Link
										href="/stage/showcase"
										className="group text-left p-5 rounded-xl bg-white/[0.02] border-[0.5px] border-border hover:border-primary-100/40 transition-all duration-200"
									>
										<div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center mb-3 group-hover:bg-amber-400/20 transition-colors">
											<Compass className="w-5 h-5 text-amber-400" />
										</div>
										<h4 className="text-sm font-medium text-inverse mb-1">
											Browse Showcase
										</h4>
										<p className="text-xs text-text/50">
											Explore published apps and templates from the community.
										</p>
									</Link>

									<Link
										href="/playground"
										className="group text-left p-5 rounded-xl bg-white/[0.02] border-[0.5px] border-border hover:border-primary-100/40 transition-all duration-200"
									>
										<div className="w-9 h-9 rounded-lg bg-emerald-400/10 flex items-center justify-center mb-3 group-hover:bg-emerald-400/20 transition-colors">
											<Play className="w-5 h-5 text-emerald-400" />
										</div>
										<h4 className="text-sm font-medium text-inverse mb-1">
											Try an App
										</h4>
										<p className="text-xs text-text/50">
											Run a pre-built app to see what Recoder Agency can do.
										</p>
									</Link>
								</div>
							</div>
						)}
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
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{(hasRecentWorkflows && activeWorkflowTab === "Recent"
								? recentWorkflows
								: featuredWorkflows
							).map((workflow) => {
								const isFeatured =
									!hasRecentWorkflows || activeWorkflowTab === "Featured";
								return (
									<div
										key={workflow.id}
										className="relative group/feature"
									>
										<WorkflowCard
											id={workflow.id}
											name={workflow.name}
											updatedAt={workflow.updatedAt}
											isFeatured={isFeatured}
										/>
										{isAdmin && (
											<button
												type="button"
												onClick={() =>
													handleToggleFeatured("workflow", workflow.id)
												}
												disabled={isTogglingFeatured}
												className="absolute top-1 right-1 z-30 p-1.5 rounded-full bg-background/80 border border-border opacity-0 group-hover/feature:opacity-100 transition-opacity hover:bg-bg-hover disabled:opacity-50"
												aria-label={
													isItemFeatured("workflow", workflow.id)
														? "Remove from featured"
														: "Feature this workflow"
												}
											>
												<StarIcon
													className={`size-3.5 transition-colors ${
														isItemFeatured("workflow", workflow.id)
															? "text-amber-400 fill-amber-400"
															: "text-text-muted"
													}`}
												/>
											</button>
										)}
									</div>
								);
							})}
						</div>

						{/* Empty state */}
						{!hasRecentWorkflows && featuredWorkflows.length === 0 && (
							<div className="py-10">
								{/* Welcome message */}
								<div className="text-center mb-8">
									<div className="w-14 h-14 rounded-2xl bg-primary-100/10 flex items-center justify-center mb-4 mx-auto">
										<SparklesIcon className="w-7 h-7 text-primary-100/60" />
									</div>
									<h3 className="text-xl font-semibold text-inverse mb-2">
										Build your first workflow
									</h3>
									<p className="text-sm text-text/60 max-w-md mx-auto">
										Workflows let you chain AI models, tools, and data sources
										into automated pipelines. Start simple and expand from
										there.
									</p>
								</div>

								{/* Quick-start cards */}
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto mb-8">
									<button
										type="button"
										onClick={handleCreateNewAgent}
										disabled={isCreatingWorkspace}
										className="group text-left p-5 rounded-xl bg-white/[0.02] border-[0.5px] border-border hover:border-primary-100/40 transition-all duration-200 disabled:opacity-50"
									>
										<div className="w-9 h-9 rounded-lg bg-primary-100/10 flex items-center justify-center mb-3 group-hover:bg-primary-100/20 transition-colors">
											<Blocks className="w-5 h-5 text-primary-100" />
										</div>
										<h4 className="text-sm font-medium text-inverse mb-1">
											Create a Workflow
										</h4>
										<p className="text-xs text-text/50">
											Open the visual editor and start connecting nodes.
										</p>
									</button>

									<Link
										href="/stage/showcase"
										className="group text-left p-5 rounded-xl bg-white/[0.02] border-[0.5px] border-border hover:border-primary-100/40 transition-all duration-200"
									>
										<div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center mb-3 group-hover:bg-amber-400/20 transition-colors">
											<Compass className="w-5 h-5 text-amber-400" />
										</div>
										<h4 className="text-sm font-medium text-inverse mb-1">
											Browse Showcase
										</h4>
										<p className="text-xs text-text/50">
											Find workflow templates and remix them for your needs.
										</p>
									</Link>

									<a
										href="https://docs.recoder.xyz"
										target="_blank"
										rel="noopener"
										className="group text-left p-5 rounded-xl bg-white/[0.02] border-[0.5px] border-border hover:border-primary-100/40 transition-all duration-200"
									>
										<div className="w-9 h-9 rounded-lg bg-emerald-400/10 flex items-center justify-center mb-3 group-hover:bg-emerald-400/20 transition-colors">
											<BookOpen className="w-5 h-5 text-emerald-400" />
										</div>
										<h4 className="text-sm font-medium text-inverse mb-1">
											Learn the Basics
										</h4>
										<p className="text-xs text-text/50">
											See how workflows are built with a quick walkthrough.
										</p>
									</a>
								</div>

								{/* How it works hint */}
								<div className="max-w-xl mx-auto p-3 rounded-lg bg-white/[0.02] border-[0.5px] border-border text-center">
									<p className="text-xs text-text/50">
										Drag nodes onto the canvas, connect them with edges, and
										hit Run. Workflows execute left to right, passing data
										between each step.
									</p>
								</div>
							</div>
						)}
					</>
				)}
			</section>
		</div>
	);
}
