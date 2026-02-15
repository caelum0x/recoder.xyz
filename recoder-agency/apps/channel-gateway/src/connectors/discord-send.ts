import { logger } from "../logger.js";
import { isDiscordBotReady, sendDiscordBotMessage } from "./discord-bot.js";

type DiscordSendParams = {
	channelId: string;
	text: string;
};

export const sendDiscordMessage = async (
	params: DiscordSendParams,
): Promise<void> => {
	if (!isDiscordBotReady()) {
		logger.warn("Discord bot not ready, message not sent.");
		return;
	}

	await sendDiscordBotMessage(params.channelId, params.text);
};
