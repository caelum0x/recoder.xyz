import { githubEvents } from "./github";
import { slackEvents } from "./slack";
import { whatsappEvents } from "./whatsapp";

export * from "./github";
export * from "./slack";
export * from "./whatsapp";

export const triggerRegistry = [
	{
		provider: "github",
		label: "GitHub Trigger",
		events: githubEvents,
	},
	{
		provider: "manual",
		label: "Manual Trigger",
		events: [],
	},
	{
		provider: "whatsapp",
		label: "WhatsApp Trigger",
		events: whatsappEvents,
	},
	{
		provider: "slack",
		label: "Slack Trigger",
		events: slackEvents,
	},
] as const;

export type TriggerProvider = (typeof triggerRegistry)[number]["provider"];

export function getEntry(triggerProvider: TriggerProvider) {
	const trigger = triggerRegistry.find(
		(entry) => entry.provider === triggerProvider,
	);
	if (trigger === undefined) {
		throw new Error(`Trigger provider ${triggerProvider} not found`);
	}
	return trigger;
}

export function isTriggerProvider(
	provider: unknown,
): provider is TriggerProvider {
	return triggerRegistry.some((entry) => entry.provider === provider);
}
