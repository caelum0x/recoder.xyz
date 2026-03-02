import {
	type GitHubEventData,
	type Output,
	OutputId,
	type TriggerNode,
} from "@recoder/protocol";
import {
	githubEvents,
	githubEventToInputFields,
} from "@recoder/trigger-registry";
import { useCallback, useTransition } from "react";
import {
	useAppDesignerStore,
	useUpdateNodeData,
} from "../../../../../../app-designer";
import { useGiselle } from "../../../../../../app-designer/store/giselle-client-provider";
import type {
	InputCallsignStep,
	InputLabelsStep,
} from "../github-trigger-properties-panel";

interface UseTriggerConfigurationReturn {
	configureTrigger: (
		event: GitHubEventData,
		step: InputCallsignStep | InputLabelsStep,
	) => void;
	isPending: boolean;
}

export const useTriggerConfiguration = ({
	node,
}: {
	node: TriggerNode;
}): UseTriggerConfigurationReturn => {
	const workspaceId = useAppDesignerStore((s) => s.workspaceId);
	const updateNodeData = useUpdateNodeData();
	const client = useGiselle();
	const [isPending, startTransition] = useTransition();

	const configureTrigger = useCallback(
		(event: GitHubEventData, step: InputCallsignStep | InputLabelsStep) => {
			const eventId = String((event as { id?: unknown }).id);
			if (!(eventId in githubEvents)) {
				return;
			}
			const githubEvent = githubEvents[eventId as keyof typeof githubEvents];

			startTransition(async () => {
				try {
					const { triggerId } = await client.configureTrigger({
						trigger: {
							nodeId: node.id,
							workspaceId,
							enable: false,
							configuration: {
								provider: "github",
								repositoryNodeId: step.repoNodeId,
								installationId: step.installationId,
								event,
								shouldPostInProgressComment: true,
							},
						},
					});

					const outputs: Output[] = githubEventToInputFields(githubEvent).map(
						(inputField) => ({
							id: OutputId.generate(),
							label: inputField.label,
							accessor: inputField.key,
						}),
					);

					updateNodeData(node, {
						content: {
							...node.content,
							state: {
								status: "configured",
								flowTriggerId: triggerId,
							},
						},
						outputs: [...node.outputs, ...outputs],
						name: `On ${githubEvent.label}`,
					});
				} catch (_error) {
					// Error is handled by the UI state
				}
			});
		},
		[client, node, updateNodeData, workspaceId],
	);

	return { configureTrigger, isPending };
};
