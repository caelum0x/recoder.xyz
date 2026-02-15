import { githubActions } from "./github";
import { slackActions } from "./slack";
import { whatsappActions } from "./whatsapp";

export * from "./github";
export * from "./slack";
export * from "./whatsapp";

export const actionRegistry = [
	{
		provider: "github",
		label: "GitHub Action",
		actions: githubActions,
	},
	{
		provider: "whatsapp",
		label: "WhatsApp Action",
		actions: whatsappActions,
	},
	{
		provider: "slack",
		label: "Slack Action",
		actions: slackActions,
	},
] as const;

export type ActionProvider = (typeof actionRegistry)[number]["provider"];

export function getEntry(actionProvider: ActionProvider) {
	return actionRegistry.find((entry) => entry.provider === actionProvider);
}

export function isActionProvider(provider: string): provider is ActionProvider {
	return actionRegistry.some((entry) => entry.provider === provider);
}
