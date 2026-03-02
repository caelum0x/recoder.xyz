import {
	slackMentionReceivedEvent,
	slackMessageReceivedEvent,
} from "@recoder/trigger-registry";
import * as z from "zod/v4";

const Provider = z.literal("slack");

const SlackMessageReceivedEventData = z.object({
	id: z.literal(slackMessageReceivedEvent.id),
});

const SlackMentionReceivedEventData = z.object({
	id: z.literal(slackMentionReceivedEvent.id),
});

export const SlackEventData = z.discriminatedUnion("id", [
	SlackMessageReceivedEventData,
	SlackMentionReceivedEventData,
]);
export type SlackEventData = z.infer<typeof SlackEventData>;

export const SlackEventConfiguration = z.object({
	provider: Provider,
	event: SlackEventData,
	botToken: z.string(),
	channelId: z.string(),
});
export type SlackEventConfiguration = z.infer<typeof SlackEventConfiguration>;
