import { dispatchNormalizedMessages } from "../dispatch.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import type { NormalizedMessage } from "./types.js";

/**
 * Persistent Discord gateway bot for DMs and guild messages.
 * Uses discord.js Client with message content intent.
 * Started alongside the HTTP server.
 */

let botReady = false;
let sendFn: ((channelId: string, text: string) => Promise<void>) | null = null;

export const isDiscordBotReady = () => botReady;

export const sendDiscordBotMessage = async (
	channelId: string,
	text: string,
): Promise<void> => {
	if (!sendFn) {
		throw new Error("Discord bot is not initialized.");
	}
	await sendFn(channelId, text);
};

export const startDiscordBot = async (): Promise<void> => {
	if (!env.DISCORD_BOT_TOKEN) {
		logger.info("Discord bot skipped (DISCORD_BOT_TOKEN not set).");
		return;
	}

	// Dynamic import to avoid requiring discord.js when not used
	const { Client, GatewayIntentBits, Partials } = await import("discord.js");

	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.DirectMessages,
			GatewayIntentBits.MessageContent,
		],
		partials: [Partials.Channel, Partials.Message],
	});

	client.on("ready", () => {
		botReady = true;
		logger.info({ user: client.user?.tag }, "Discord bot connected");
	});

	client.on("messageCreate", async (message) => {
		// Ignore bot messages
		if (message.author.bot) return;
		const text = message.content?.trim();
		if (!text) return;

		const isDM = !message.guild;
		const normalized: NormalizedMessage = {
			provider: "discord",
			messageId: message.id,
			channelId: message.channel.id,
			channelType: isDM ? "dm" : "guild",
			senderId: message.author.id,
			senderDisplayName: message.author.globalName ?? message.author.username,
			threadId: message.reference?.messageId ?? undefined,
			text,
			eventType: "message",
			rawEvent: {
				guildId: message.guild?.id,
				channelId: message.channel.id,
				authorId: message.author.id,
			},
			receivedAt: new Date().toISOString(),
		};

		try {
			await dispatchNormalizedMessages([normalized]);
		} catch (error) {
			logger.error(
				{ error: String(error), messageId: message.id },
				"Discord bot dispatch failed",
			);
		}
	});

	sendFn = async (channelId: string, text: string) => {
		try {
			const channel = await client.channels.fetch(channelId);
			if (channel && "send" in channel) {
				await channel.send(text);
			}
		} catch (error) {
			logger.warn(
				{ error: String(error), channelId },
				"Discord bot send failed",
			);
		}
	};

	await client.login(env.DISCORD_BOT_TOKEN);
};
