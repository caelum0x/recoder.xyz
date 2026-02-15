import { sendDiscordMessage } from "./connectors/discord-send.js";
import { sendSlackMessage } from "./connectors/slack-send.js";
import { sendTelegramMessage } from "./connectors/telegram-send.js";
import type { NormalizedMessage } from "./connectors/types.js";
import { sendWhatsAppMessage } from "./connectors/whatsapp-send.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const sendReply = async (
	message: NormalizedMessage,
	replyText: string,
	replyBlocks?: Array<Record<string, unknown>>,
): Promise<void> => {
	switch (message.provider) {
		case "slack": {
			const threadTs =
				message.channelType === "im"
					? undefined
					: (message.threadId ?? message.messageId);
			await sendSlackMessage({
				channel: message.channelId,
				text: replyText,
				thread_ts: threadTs,
				blocks: replyBlocks,
			});
			break;
		}
		case "whatsapp":
			await sendWhatsAppMessage({
				to: message.channelId,
				text: replyText,
			});
			break;
		case "telegram":
			await sendTelegramMessage({
				chatId: message.channelId,
				text: replyText,
				replyToMessageId: message.threadId,
			});
			break;
		case "discord":
			await sendDiscordMessage({
				channelId: message.channelId,
				text: replyText,
			});
			break;
	}
};

export const dispatchNormalizedMessages = async (
	messages: NormalizedMessage[],
	requestId?: string,
) => {
	const reqLogger = requestId ? logger.child({ requestId }) : logger;
	if (!env.CHANNEL_GATEWAY_AGENCY_URL || !env.CHANNEL_GATEWAY_SHARED_SECRET) {
		reqLogger.warn(
			"Channel gateway dispatch skipped (missing CHANNEL_GATEWAY_AGENCY_URL or CHANNEL_GATEWAY_SHARED_SECRET).",
		);
		return;
	}

	for (const message of messages) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 30_000);
			let response: Response;
			try {
				response = await fetch(
					`${env.CHANNEL_GATEWAY_AGENCY_URL}/api/channel-gateway/messages`,
					{
						method: "POST",
						headers: {
							"content-type": "application/json",
							"x-channel-gateway-secret": env.CHANNEL_GATEWAY_SHARED_SECRET,
						},
						body: JSON.stringify(message),
						signal: controller.signal,
					},
				);
			} finally {
				clearTimeout(timeout);
			}

			const payload = (await response.json().catch(() => null)) as {
				replyText?: string;
				replyBlocks?: Array<Record<string, unknown>>;
			} | null;
			reqLogger.info(
				{
					provider: message.provider,
					channelId: message.channelId,
					senderId: message.senderId,
					messageId: message.messageId,
					status: response.status,
					payload,
				},
				"Dispatched normalized message",
			);

			if (response.ok) {
				const replyText = payload?.replyText;
				const replyBlocks = payload?.replyBlocks;
				if (!replyText && !replyBlocks) continue;

				await sendReply(message, replyText ?? "Update", replyBlocks);
			}
		} catch (error) {
			reqLogger.error(
				{
					provider: message.provider,
					channelId: message.channelId,
					senderId: message.senderId,
					messageId: message.messageId,
					error: String(error),
				},
				"Failed to dispatch normalized message",
			);
		}
	}
};
