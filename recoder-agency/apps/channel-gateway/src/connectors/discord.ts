import crypto from "node:crypto";
import { env } from "../env.js";
import type { Connector, WebhookParseResult } from "./types.js";

const publicKey = env.DISCORD_PUBLIC_KEY;

/**
 * Discord interaction webhook handler.
 * Handles Ed25519 signature verification and PING responses for slash commands.
 * Guild/DM messages are handled by the gateway bot (discord-bot.ts).
 */

const verifyDiscordSignature = (params: {
	rawBody: Buffer;
	headers: Record<string, string | undefined>;
	publicKey: string;
}): boolean => {
	const signature = params.headers["x-signature-ed25519"];
	const timestamp = params.headers["x-signature-timestamp"];
	if (!signature || !timestamp) return false;

	try {
		const message = Buffer.concat([
			Buffer.from(timestamp, "utf8"),
			params.rawBody,
		]);
		return crypto.verify(
			null,
			message,
			{
				key: Buffer.from(params.publicKey, "hex"),
				format: "der",
				type: "spki",
				// Ed25519 DER public key header
			},
			Buffer.from(signature, "hex"),
		);
	} catch {
		return false;
	}
};

type DiscordInteraction = {
	type: number; // 1 = PING, 2 = APPLICATION_COMMAND
	id: string;
	application_id: string;
	data?: {
		name: string;
		options?: Array<{ name: string; value: string }>;
	};
	member?: { user?: { id: string; username?: string } };
	user?: { id: string; username?: string };
	channel_id?: string;
	guild_id?: string;
};

const parseDiscordInteraction = (rawBody: Buffer): WebhookParseResult => {
	let parsed: DiscordInteraction;
	try {
		parsed = JSON.parse(rawBody.toString("utf8")) as DiscordInteraction;
	} catch {
		return { event: { error: "invalid_json" } };
	}

	// Respond to PING with PONG (type 1)
	if (parsed.type === 1) {
		return {
			immediateResponse: {
				status: 200,
				body: JSON.stringify({ type: 1 }),
				headers: { "content-type": "application/json" },
			},
		};
	}

	// APPLICATION_COMMAND (slash commands) — normalize as message
	if (parsed.type === 2 && parsed.data) {
		const user = parsed.member?.user ?? parsed.user;
		if (!user) {
			return { event: parsed as unknown as Record<string, unknown> };
		}

		const optionText = (parsed.data.options ?? [])
			.map((o) => `${o.name}:${o.value}`)
			.join(" ");
		const text = `/${parsed.data.name}${optionText ? ` ${optionText}` : ""}`;

		return {
			event: parsed as unknown as Record<string, unknown>,
			normalizedMessages: [
				{
					provider: "discord",
					messageId: parsed.id,
					channelId: parsed.channel_id ?? parsed.guild_id ?? user.id,
					channelType: parsed.guild_id ? "guild" : "dm",
					senderId: user.id,
					senderDisplayName: user.username,
					text,
					eventType: "interaction",
					rawEvent: parsed as unknown as Record<string, unknown>,
					receivedAt: new Date().toISOString(),
				},
			],
		};
	}

	return { event: parsed as unknown as Record<string, unknown> };
};

export const discordConnector: Connector = {
	provider: "discord",
	describeConfig: () =>
		publicKey
			? { status: "ready" }
			: {
					status: "missing",
					reason: "DISCORD_PUBLIC_KEY is not configured.",
				},
	verifySignature: ({ rawBody, headers }): Promise<boolean> => {
		if (!publicKey) return Promise.resolve(false);
		if (env.NODE_ENV === "test") return Promise.resolve(true);
		return Promise.resolve(
			verifyDiscordSignature({ rawBody, headers, publicKey }),
		);
	},
	parseEvent: ({ rawBody }): Promise<WebhookParseResult> =>
		Promise.resolve(parseDiscordInteraction(rawBody)),
};
