import * as z from "zod/v4";

interface SlackAction {
	id: string;
	label: string;
	payload: z.ZodObject;
}

export const slackSendMessageAction = {
	id: "slack.send.message",
	label: "Send Message",
	payload: z.object({
		channelId: z.string().meta({ label: "Channel ID" }),
		text: z.string().meta({ label: "Message Text" }),
	}),
} as const satisfies SlackAction;

export const slackSendReplyAction = {
	id: "slack.send.reply",
	label: "Send Reply",
	payload: z.object({
		channelId: z.string().meta({ label: "Channel ID" }),
		text: z.string().meta({ label: "Message Text" }),
		threadTs: z.string().meta({ label: "Thread Timestamp" }),
	}),
} as const satisfies SlackAction;

export const slackActions = {
	[slackSendMessageAction.id]: slackSendMessageAction,
	[slackSendReplyAction.id]: slackSendReplyAction,
} as const;

export type SlackActionId = keyof typeof slackActions;

export const slackActionEntries = Object.values(slackActions);

export function isSlackActionId(id: string): id is SlackActionId {
	return id in slackActions;
}
