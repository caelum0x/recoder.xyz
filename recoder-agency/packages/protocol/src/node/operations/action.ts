import type {
	GitHubActionId,
	SlackActionId,
	WhatsAppActionId,
} from "@recoder/action-registry";
import * as z from "zod/v4";

const GitHubActionUnconfiguredState = z.object({
	status: z.literal("unconfigured"),
});
export type GitHubActionUnconfiguredState = z.infer<
	typeof GitHubActionUnconfiguredState
>;

const GitHubActionConfiguredState = z.object({
	status: z.literal("configured"),
	/** @deprecated commandId is an old name, so we want to change it to ActionId */
	commandId: z.custom<GitHubActionId>(),
	installationId: z.number(),
	repositoryNodeId: z.string(),
});
export type GitHubActionConfiguredState = z.infer<
	typeof GitHubActionConfiguredState
>;

const GitHubActionReconfiguringState = z.object({
	status: z.literal("reconfiguring"),
	/** @deprecated commandId is an old name, so we want to change it to ActionId */
	commandId: z.custom<GitHubActionId>(),
});
export type GitHubActionReconfiguringState = z.infer<
	typeof GitHubActionReconfiguringState
>;

const GitHubActionData = z.object({
	provider: z.literal("github"),
	state: z.discriminatedUnion("status", [
		GitHubActionUnconfiguredState,
		GitHubActionConfiguredState,
		GitHubActionReconfiguringState,
	]),
});
export type GitHubActionData = z.infer<typeof GitHubActionData>;

const WhatsAppActionUnconfiguredState = z.object({
	status: z.literal("unconfigured"),
});
export type WhatsAppActionUnconfiguredState = z.infer<
	typeof WhatsAppActionUnconfiguredState
>;

const WhatsAppActionConfiguredState = z.object({
	status: z.literal("configured"),
	commandId: z.custom<WhatsAppActionId>(),
	phoneNumberId: z.string(),
	accessToken: z.string(),
});
export type WhatsAppActionConfiguredState = z.infer<
	typeof WhatsAppActionConfiguredState
>;

const WhatsAppActionData = z.object({
	provider: z.literal("whatsapp"),
	state: z.discriminatedUnion("status", [
		WhatsAppActionUnconfiguredState,
		WhatsAppActionConfiguredState,
	]),
});
export type WhatsAppActionData = z.infer<typeof WhatsAppActionData>;

const SlackActionUnconfiguredState = z.object({
	status: z.literal("unconfigured"),
});
export type SlackActionUnconfiguredState = z.infer<
	typeof SlackActionUnconfiguredState
>;

const SlackActionConfiguredState = z.object({
	status: z.literal("configured"),
	commandId: z.custom<SlackActionId>(),
	botToken: z.string(),
	channelId: z.string(),
});
export type SlackActionConfiguredState = z.infer<
	typeof SlackActionConfiguredState
>;

const SlackActionData = z.object({
	provider: z.literal("slack"),
	state: z.discriminatedUnion("status", [
		SlackActionUnconfiguredState,
		SlackActionConfiguredState,
	]),
});
export type SlackActionData = z.infer<typeof SlackActionData>;

const ActionData = z.discriminatedUnion("provider", [
	GitHubActionData,
	WhatsAppActionData,
	SlackActionData,
]);
export type ActionData = z.infer<typeof ActionData>;

export const ActionContent = z.object({
	type: z.literal("action"),
	/** @deprecated command is an old name, so we want to change it to data */
	command: ActionData,
});
export type ActionContent = z.infer<typeof ActionContent>;

export const ActionContentReference = z.object({
	type: ActionContent.shape.type,
});
export type ActionContentReference = z.infer<typeof ActionContentReference>;
