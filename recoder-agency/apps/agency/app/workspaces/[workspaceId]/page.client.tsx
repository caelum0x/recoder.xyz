"use client";

import {
	AppDesignerProvider,
	Editor,
} from "@recoder-internal/workflow-designer-ui";
import type { Integration } from "@recoder/giselle";
import type { Trigger, Workspace } from "@recoder/protocol";
import { GiselleClientProvider, WorkspaceProvider } from "@recoder/react";
import { use, useMemo } from "react";
import { createInternalGiselleClient } from "@/lib/internal-api/create-giselle-client";
import type { LoaderData } from "./data-loader";

interface Props {
	dataLoader: Promise<LoaderData>;
	integrationRefreshAction: () => Promise<Partial<Integration>>;
	triggerUpdateAction: (trigger: Trigger) => Promise<void>;
	workspaceSaveAction: (workspace: Workspace) => Promise<void>;
	workspaceNameUpdateAction: (name: string) => Promise<void>;
}
export function Page({
	dataLoader,
	integrationRefreshAction,
	triggerUpdateAction: flowTriggerUpdateAction,
	workspaceNameUpdateAction,
	workspaceSaveAction,
}: Props) {
	const data = use(dataLoader);
	const client = useMemo(() => {
		return createInternalGiselleClient();
	}, []);

	return (
		<GiselleClientProvider value={client}>
			<AppDesignerProvider
				giselleClient={client}
				llmProviders={data.llmProviders}
				save={workspaceSaveAction}
				initialWorkspace={data.data}
			>
				<WorkspaceProvider
					// TODO: Make it reference the same timeout setting as in trigger.config.ts
					generationTimeout={3600 * 1000}
					integration={{
						value: {
							github: data.gitHubIntegrationState,
						},
						refresh: integrationRefreshAction,
					}}
					vectorStore={{
						githubRepositoryIndexes: data.gitHubRepositoryIndexes,
						documentSettingPath: "/settings/team/vector-stores/document",
						githubSettingPath: "/settings/team/vector-stores",
						documentStores: data.documentVectorStores.map((store) => ({
							id: store.id,
							name: store.name,
							embeddingProfileIds: store.embeddingProfileIds,
							sources: store.sources.map((source) => ({
								id: source.id,
								fileName: source.fileName,
								ingestStatus: source.ingestStatus,
								ingestErrorCode: source.ingestErrorCode,
							})),
							isOfficial: store.isOfficial,
						})),
					}}
					usageLimits={data.usageLimits}
					dataStore={{
						dataStores: data.teamDataStores,
						settingPath: "/settings/team/data-stores",
					}}
					telemetry={{
						metadata: {
							teamPlan: data.workspaceTeam.plan,
							userId: data.currentUser.id,
							subscriptionId: data.workspaceTeam.activeSubscriptionId ?? "",
						},
					}}
					featureFlag={data.featureFlags}
					trigger={{
						callbacks: {
							triggerUpdate: flowTriggerUpdateAction,
						},
					}}
				>
					<div className="flex flex-col h-screen bg-black-900">
						{!data.byokStatus.hasKeys && (
							<div className="mx-4 mt-3 rounded-[10px] border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm text-white">
								<p className="font-semibold text-yellow-400">
									API Key Required
								</p>
								<p className="text-white/75 mt-1">
									Recoder.xyz is in BYOK (Bring Your Own Key) beta. Add your AI
									provider API keys at{" "}
									<a
										href="https://recoder.xyz/settings/ai-providers"
										target="_blank"
										rel="noopener noreferrer"
										className="underline text-yellow-300 hover:text-yellow-200"
									>
										recoder.xyz/settings/ai-providers
									</a>{" "}
									to use AI features.
								</p>
							</div>
						)}
						<Editor
							onFlowNameChange={workspaceNameUpdateAction}
							teamName={data.workspaceTeam.name}
							teamAvatarUrl={data.workspaceTeam.avatarUrl}
						/>
					</div>
				</WorkspaceProvider>
			</AppDesignerProvider>
		</GiselleClientProvider>
	);
}
