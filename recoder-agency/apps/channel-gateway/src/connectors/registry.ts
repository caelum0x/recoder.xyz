import { discordConnector } from "./discord.js";
import { slackConnector } from "./slack.js";
import { telegramConnector } from "./telegram.js";
import type { Connector, ProviderId } from "./types.js";
import { whatsappConnector } from "./whatsapp.js";

const connectors: Record<ProviderId, Connector> = {
	slack: slackConnector,
	whatsapp: whatsappConnector,
	telegram: telegramConnector,
	discord: discordConnector,
};

export const getConnector = (provider: ProviderId): Connector =>
	connectors[provider];
