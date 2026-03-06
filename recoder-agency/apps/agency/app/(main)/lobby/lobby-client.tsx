"use client";

import { Blocks, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionCard } from "./components/action-card";
import { AppCard } from "./components/app-card";
import { SubTabs } from "./components/sub-tabs";
import { TopLightOverlay } from "./components/top-light-overlay";
import { TutorialVideoSection } from "./components/tutorial-video-section";
import { WorkflowCard } from "./components/workflow-card";
import { GreetingHeading } from "./greeting-heading";

interface LobbyClientProps {
	username: string;
	recentApps: { title: string; appsCount: number }[];
	recentWorkflows: { id: string; name: string; updatedAt: Date }[];
}

export function LobbyClient({
	username,
	recentApps,
	recentWorkflows,
}: LobbyClientProps) {
	const [activeTab, setActiveTab] = useState<"apps" | "workflow">("apps");
	const [activeAppTab, setActiveAppTab] = useState<string>("Recent");
	const [activeWorkflowTab, setActiveWorkflowTab] = useState<string>("Recent");
	const router = useRouter();
	const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

	const hasRecentApps = recentApps.length > 0;
	const hasRecentWorkflows = recentWorkflows.length > 0;

	// Featured items are not yet implemented; show empty arrays
	const featuredApps: { title: string; appsCount: number }[] = [];
	const featuredWorkflows: { id: string; name: string; updatedAt: Date }[] = [];

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
									window.open("https://recoder.xyz/blog", "_blank");
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
						<div className="flex flex-wrap gap-6">
							{(hasRecentApps && activeAppTab === "Recent"
								? recentApps
								: featuredApps
							).map((item, index) => (
								<AppCard key={item.title} title={item.title} index={index} />
							))}
						</div>

						{/* Empty state */}
						{!hasRecentApps && featuredApps.length === 0 && (
							<div className="flex flex-col items-center justify-center py-16 text-center">
								<div className="w-14 h-14 rounded-2xl bg-primary-100/10 flex items-center justify-center mb-4">
									<Blocks className="w-7 h-7 text-primary-100/60" />
								</div>
								<h3 className="text-lg font-medium text-inverse mb-2">No apps yet</h3>
								<p className="text-sm text-muted-foreground max-w-sm">
									Create your first agent to get started. Apps you build will appear here.
								</p>
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

						{/* Empty state */}
						{!hasRecentWorkflows && featuredWorkflows.length === 0 && (
							<div className="flex flex-col items-center justify-center py-16 text-center">
								<div className="w-14 h-14 rounded-2xl bg-primary-100/10 flex items-center justify-center mb-4">
									<SparklesIcon className="w-7 h-7 text-primary-100/60" />
								</div>
								<h3 className="text-lg font-medium text-inverse mb-2">No workflows yet</h3>
								<p className="text-sm text-muted-foreground max-w-sm">
									Create a workflow to automate tasks. Your workflows will appear here.
								</p>
							</div>
						)}
					</>
				)}
			</section>
		</div>
	);
}
