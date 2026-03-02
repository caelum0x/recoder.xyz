/**
 * Slack webhook handler — maps incoming Slack events to Giselle tasks.
 *
 * The app-level route queries the DB for flow triggers, loads each from
 * storage, and calls `handleSlackTrigger` for each matching Slack trigger.
 */

import type { Trigger } from "@recoder/protocol";
import type { OnGenerationComplete, OnGenerationError } from "../generations";
import { createAndStartTask, type OnTaskCreate } from "../tasks";
import { getWorkspace } from "../workspaces";
import type { GiselleContext } from "../types";

export interface SlackWebhookPayload {
	userId: string;
	channelId: string;
	text: string;
	timestamp: string;
	threadTs?: string;
	isMention?: boolean;
}

/**
 * Process a single Slack trigger that matched the incoming webhook event.
 *
 * Called by the app-level route after it resolves which triggers match the
 * incoming Slack channelId.
 */
export async function handleSlackTrigger(args: {
	context: GiselleContext;
	trigger: Trigger;
	payload: SlackWebhookPayload;
	onGenerationComplete?: OnGenerationComplete;
	onGenerationError?: OnGenerationError;
	onTaskCreate?: OnTaskCreate;
}): Promise<void> {
	const { context, trigger, payload } = args;

	const workspace = await getWorkspace({
		context,
		workspaceId: trigger.workspaceId,
	});

	// Map Slack payload fields to ParametersInput items.
	// The trigger resolver reads items by `name` matching the node output accessor.
	await createAndStartTask({
		context,
		nodeId: trigger.nodeId,
		workspace,
		generationOriginType: "api",
		inputs: [
			{
				type: "parameters" as const,
				items: [
					{ type: "string" as const, name: "userId", value: payload.userId },
					{
						type: "string" as const,
						name: "channelId",
						value: payload.channelId,
					},
					{ type: "string" as const, name: "text", value: payload.text },
					{
						type: "string" as const,
						name: "timestamp",
						value: payload.timestamp,
					},
					...(payload.threadTs
						? [
								{
									type: "string" as const,
									name: "threadTs",
									value: payload.threadTs,
								},
							]
						: []),
				],
			},
		],
		callbacks: {
			generationComplete: args.onGenerationComplete,
			generationError: args.onGenerationError,
			taskCreate: async ({ task }) => {
				await args.onTaskCreate?.({ task });
			},
		},
	});
}

/**
 * Convenience wrapper — kept for backwards compatibility.
 * In production, the app-level route should call `handleSlackTrigger` directly
 * after resolving triggers from the database.
 */
export async function handleSlackWebhook(
	payload: SlackWebhookPayload,
): Promise<void> {
	const eventType = payload.isMention ? "mention" : "message";
	console.log(
		`[slack] Received ${eventType} from ${payload.userId} in ${payload.channelId}: ${payload.text.slice(0, 100)}`,
	);
}
