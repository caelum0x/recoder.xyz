import crypto from "node:crypto";
import { env } from "../env.js";
import type {
	Connector,
	NormalizedMessage,
	WebhookParseResult,
} from "./types.js";

const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();

const timingSafeEqual = (a: string, b: string) => {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
};

export const verifySlackSignature = (params: {
	rawBody: Buffer;
	headers: Record<string, string | undefined>;
	signingSecret: string;
}) => {
	const timestamp = params.headers["x-slack-request-timestamp"];
	const signature = params.headers["x-slack-signature"];

	if (!timestamp || !signature) {
		return false;
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	const ts = Number(timestamp);
	if (!Number.isFinite(ts)) return false;

	// Reject replays older than 5 minutes
	if (Math.abs(nowSeconds - ts) > 60 * 5) {
		return false;
	}

	const base = `v0:${timestamp}:${params.rawBody.toString("utf8")}`;
	const digest = crypto
		.createHmac("sha256", params.signingSecret)
		.update(base)
		.digest("hex");
	const expected = `v0=${digest}`;

	return timingSafeEqual(expected, signature);
};

type SlackMessageEvent = {
	type: "message";
	user?: string;
	bot_id?: string;
	subtype?: string;
	username?: string;
	text?: string;
	ts?: string;
	thread_ts?: string;
	event_ts?: string;
	parent_user_id?: string;
	channel: string;
	channel_type?: "im" | "mpim" | "channel" | "group";
};

type SlackAppMentionEvent = {
	type: "app_mention";
	user?: string;
	bot_id?: string;
	username?: string;
	text?: string;
	ts?: string;
	thread_ts?: string;
	event_ts?: string;
	parent_user_id?: string;
	channel: string;
	channel_type?: "im" | "mpim" | "channel" | "group";
};

type SlackEventCallback = {
	type: "event_callback";
	event: SlackMessageEvent | SlackAppMentionEvent;
	event_id?: string;
	event_time?: number;
};

type SlackUrlVerification = {
	type: "url_verification";
	challenge?: string;
};

const normalizeSlackMessage = (
	event: SlackMessageEvent | SlackAppMentionEvent,
): NormalizedMessage | null => {
	const isBotMessage =
		Boolean(event.bot_id) ||
		("subtype" in event && event.subtype === "bot_message");
	if (isBotMessage) return null;
	if (!event.user) return null;
	const text = event.text?.trim() ?? "";
	if (!text) return null;

	return {
		provider: "slack",
		messageId: event.ts ?? event.event_ts ?? crypto.randomUUID(),
		threadId: event.thread_ts ?? undefined,
		channelId: event.channel,
		channelType: event.channel_type,
		senderId: event.user,
		senderDisplayName: event.username,
		text,
		eventType: event.type,
		rawEvent: event as unknown as Record<string, unknown>,
		receivedAt: new Date().toISOString(),
	};
};

const parseSlackEvent = (rawBody: Buffer): WebhookParseResult => {
	let parsed:
		| SlackUrlVerification
		| SlackEventCallback
		| Record<string, unknown>;
	try {
		parsed = JSON.parse(rawBody.toString("utf8")) as
			| SlackUrlVerification
			| SlackEventCallback
			| Record<string, unknown>;
	} catch {
		return { event: { error: "invalid_json" } };
	}

	if (parsed.type === "url_verification") {
		const challenge = String((parsed as SlackUrlVerification).challenge ?? "");
		return {
			immediateResponse: {
				status: 200,
				body: challenge,
				headers: { "content-type": "text/plain" },
			},
		};
	}

	if (parsed.type === "event_callback") {
		const event = (parsed as SlackEventCallback).event;
		if (event?.type === "message" || event?.type === "app_mention") {
			const normalized = normalizeSlackMessage(event);
			return {
				event: parsed as Record<string, unknown>,
				normalizedMessages: normalized ? [normalized] : [],
			};
		}
	}

	return { event: parsed as Record<string, unknown> };
};

export const slackConnector: Connector = {
	provider: "slack",
	describeConfig: () =>
		signingSecret
			? { status: "ready" }
			: {
					status: "missing",
					reason: "SLACK_SIGNING_SECRET is not configured.",
				},
	verifySignature: ({
		rawBody,
		headers,
	}: {
		rawBody: Buffer;
		headers: Record<string, string | undefined>;
	}): Promise<boolean> => {
		if (!signingSecret) return Promise.resolve(false);
		if (env.NODE_ENV === "test") return Promise.resolve(true);
		return Promise.resolve(
			verifySlackSignature({ rawBody, headers, signingSecret }),
		);
	},
	parseEvent: ({ rawBody }: { rawBody: Buffer }): Promise<WebhookParseResult> =>
		Promise.resolve(parseSlackEvent(rawBody)),
};
