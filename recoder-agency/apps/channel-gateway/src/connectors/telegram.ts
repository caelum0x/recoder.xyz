import { timingSafeEqual } from "node:crypto";
import { env } from "../env.js";
import type {
	Connector,
	NormalizedMessage,
	WebhookParseResult,
} from "./types.js";

const botToken = env.TELEGRAM_BOT_TOKEN;
const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;

type TelegramUser = {
	id: number;
	is_bot: boolean;
	first_name?: string;
	last_name?: string;
	username?: string;
};

type TelegramChat = {
	id: number;
	type: "private" | "group" | "supergroup" | "channel";
	title?: string;
};

type TelegramMessage = {
	message_id: number;
	from?: TelegramUser;
	chat: TelegramChat;
	date: number;
	text?: string;
	reply_to_message?: TelegramMessage;
};

type TelegramUpdate = {
	update_id: number;
	message?: TelegramMessage;
	edited_message?: TelegramMessage;
};

const normalizeTelegramMessage = (
	msg: TelegramMessage,
): NormalizedMessage | null => {
	if (!msg.from || msg.from.is_bot) return null;
	const text = msg.text?.trim();
	if (!text) return null;

	const displayParts = [msg.from.first_name, msg.from.last_name].filter(
		Boolean,
	);
	const senderDisplayName =
		displayParts.length > 0
			? displayParts.join(" ")
			: (msg.from.username ?? undefined);

	return {
		provider: "telegram",
		messageId: String(msg.message_id),
		channelId: String(msg.chat.id),
		channelType: msg.chat.type,
		senderId: String(msg.from.id),
		senderDisplayName,
		threadId: msg.reply_to_message
			? String(msg.reply_to_message.message_id)
			: undefined,
		text,
		eventType: "message",
		rawEvent: msg as unknown as Record<string, unknown>,
		receivedAt: new Date().toISOString(),
	};
};

const parseTelegramEvent = (rawBody: Buffer): WebhookParseResult => {
	let parsed: TelegramUpdate;
	try {
		parsed = JSON.parse(rawBody.toString("utf8")) as TelegramUpdate;
	} catch {
		return { event: { error: "invalid_json" } };
	}
	const msg = parsed.message ?? parsed.edited_message;

	if (!msg) {
		return { event: parsed as unknown as Record<string, unknown> };
	}

	const normalized = normalizeTelegramMessage(msg);
	return {
		event: parsed as unknown as Record<string, unknown>,
		normalizedMessages: normalized ? [normalized] : [],
	};
};

export const telegramConnector: Connector = {
	provider: "telegram",
	describeConfig: () =>
		botToken
			? { status: "ready" }
			: {
					status: "missing",
					reason: "TELEGRAM_BOT_TOKEN is not configured.",
				},
	verifySignature: ({ headers }): Promise<boolean> => {
		if (!webhookSecret) return Promise.resolve(false);
		if (env.NODE_ENV === "test") return Promise.resolve(true);
		const provided = headers["x-telegram-bot-api-secret-token"];
		if (!provided) return Promise.resolve(false);
		const expectedBuf = Buffer.from(webhookSecret);
		const providedBuf = Buffer.from(provided);
		if (expectedBuf.length !== providedBuf.length)
			return Promise.resolve(false);
		return Promise.resolve(timingSafeEqual(expectedBuf, providedBuf));
	},
	parseEvent: ({ rawBody }): Promise<WebhookParseResult> =>
		Promise.resolve(parseTelegramEvent(rawBody)),
};
