/**
 * WhatsApp webhook handler — maps incoming WhatsApp messages to Giselle tasks.
 *
 * The app-level route queries the DB for flow triggers, loads each from
 * storage, and calls `handleWhatsAppTrigger` for each matching WhatsApp trigger.
 */

import type { Trigger } from "@recoder/protocol";
import type { OnGenerationComplete, OnGenerationError } from "../generations";
import { createAndStartTask, type OnTaskCreate } from "../tasks";
import { getWorkspace } from "../workspaces";
import type { GiselleContext } from "../types";

export interface WhatsAppWebhookPayload {
	from: string;
	body: string;
	timestamp: string;
	phoneNumberId?: string;
	mediaUrl?: string;
}

/**
 * Process a single WhatsApp trigger that matched the incoming webhook event.
 *
 * Called by the app-level route after it resolves which triggers match the
 * incoming WhatsApp phoneNumberId.
 */
export async function handleWhatsAppTrigger(args: {
	context: GiselleContext;
	trigger: Trigger;
	payload: WhatsAppWebhookPayload;
	onGenerationComplete?: OnGenerationComplete;
	onGenerationError?: OnGenerationError;
	onTaskCreate?: OnTaskCreate;
}): Promise<void> {
	const { context, trigger, payload } = args;

	const workspace = await getWorkspace({
		context,
		workspaceId: trigger.workspaceId,
	});

	// Map WhatsApp payload fields to ParametersInput items.
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
					{ type: "string" as const, name: "from", value: payload.from },
					{ type: "string" as const, name: "body", value: payload.body },
					{
						type: "string" as const,
						name: "timestamp",
						value: payload.timestamp,
					},
					...(payload.phoneNumberId
						? [
								{
									type: "string" as const,
									name: "phoneNumberId",
									value: payload.phoneNumberId,
								},
							]
						: []),
					...(payload.mediaUrl
						? [
								{
									type: "string" as const,
									name: "mediaUrl",
									value: payload.mediaUrl,
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
 * In production, the app-level route should call `handleWhatsAppTrigger`
 * directly after resolving triggers from the database.
 */
export async function handleWhatsAppWebhook(
	payload: WhatsAppWebhookPayload,
): Promise<void> {
	console.log(
		`[whatsapp] Received message from ${payload.from} via ${payload.phoneNumberId}: ${payload.body.slice(0, 100)}`,
	);
}
