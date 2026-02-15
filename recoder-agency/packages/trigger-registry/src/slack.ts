import z from "zod/v4";

interface SlackEvent {
	id: string;
	label: string;
	payload: z.ZodObject;
}

export const slackMessageReceivedEvent = {
	id: "slack.message.received",
	label: "Message Received",
	payload: z.object({
		userId: z.string().meta({ label: "Slack User ID" }),
		channelId: z.string().meta({ label: "Channel ID" }),
		text: z
			.string()
			.meta({ label: "Message Text", input: { multiline: true } }),
		timestamp: z.string().meta({ label: "Timestamp" }),
		threadTs: z.string().optional().meta({ label: "Thread Timestamp" }),
	}),
} as const satisfies SlackEvent;

export const slackMentionReceivedEvent = {
	id: "slack.mention.received",
	label: "Mention Received",
	payload: z.object({
		userId: z.string().meta({ label: "Slack User ID" }),
		channelId: z.string().meta({ label: "Channel ID" }),
		text: z
			.string()
			.meta({ label: "Message Text", input: { multiline: true } }),
		timestamp: z.string().meta({ label: "Timestamp" }),
		threadTs: z.string().optional().meta({ label: "Thread Timestamp" }),
	}),
} as const satisfies SlackEvent;

export const slackEvents = {
	[slackMessageReceivedEvent.id]: slackMessageReceivedEvent,
	[slackMentionReceivedEvent.id]: slackMentionReceivedEvent,
};

export type SlackEventId = keyof typeof slackEvents;

export const slackEventEntries = Object.values(slackEvents);

export function isSlackEventId(id: string): id is SlackEventId {
	return id in slackEvents;
}
