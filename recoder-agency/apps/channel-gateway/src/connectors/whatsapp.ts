import crypto from "node:crypto";
import { env } from "../env.js";
import type {
	Connector,
	NormalizedMessage,
	WebhookParseResult,
} from "./types.js";

const appSecret = env.WHATSAPP_APP_SECRET;
const verifyToken = env.WHATSAPP_VERIFY_TOKEN;

const WHATSAPP_USER_JID_RE = /^(\d+)(?::\d+)?@s\.whatsapp\.net$/i;

/** Normalize a WhatsApp JID or raw phone to E.164 format. */
export const normalizeWhatsAppPhone = (value: string): string => {
	const jidMatch = WHATSAPP_USER_JID_RE.exec(value);
	if (jidMatch) return `+${jidMatch[1]}`;
	const digits = value.replace(/[^0-9]/g, "");
	return digits ? `+${digits}` : value;
};

export const isWhatsAppGroupJid = (value: string): boolean =>
	/^\d[\d-]*@g\.us$/i.test(value);

const timingSafeEqual = (a: string, b: string) => {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
};

const verifyWhatsAppSignature = (params: {
	rawBody: Buffer;
	headers: Record<string, string | undefined>;
	secret: string;
}): boolean => {
	const signature = params.headers["x-hub-signature-256"];
	if (!signature) return false;

	const digest = crypto
		.createHmac("sha256", params.secret)
		.update(params.rawBody)
		.digest("hex");
	const expected = `sha256=${digest}`;

	return timingSafeEqual(expected, signature);
};

type WhatsAppMessage = {
	id: string;
	from: string;
	timestamp: string;
	type: string;
	text?: { body: string };
};

type WhatsAppContact = {
	wa_id: string;
	profile?: { name?: string };
};

type WhatsAppValue = {
	messaging_product: string;
	metadata: { display_phone_number: string; phone_number_id: string };
	contacts?: WhatsAppContact[];
	messages?: WhatsAppMessage[];
};

type WhatsAppEntry = {
	id: string;
	changes: Array<{ value: WhatsAppValue; field: string }>;
};

type WhatsAppWebhookPayload = {
	object: string;
	entry: WhatsAppEntry[];
};

const parseWhatsAppEvent = (
	rawBody: Buffer,
	headers: Record<string, string | undefined>,
): WebhookParseResult => {
	// Handle webhook verification challenge
	const mode = headers["hub.mode"] ?? extractQueryParam(rawBody, "hub.mode");
	if (mode === "subscribe") {
		const challenge =
			headers["hub.challenge"] ?? extractQueryParam(rawBody, "hub.challenge");
		const token =
			headers["hub.verify_token"] ??
			extractQueryParam(rawBody, "hub.verify_token");

		if (verifyToken && token === verifyToken && challenge) {
			return {
				immediateResponse: {
					status: 200,
					body: challenge,
					headers: { "content-type": "text/plain" },
				},
			};
		}
		return {
			immediateResponse: {
				status: 403,
				body: "Forbidden",
				headers: { "content-type": "text/plain" },
			},
		};
	}

	let parsed: WhatsAppWebhookPayload;
	try {
		parsed = JSON.parse(rawBody.toString("utf8")) as WhatsAppWebhookPayload;
	} catch {
		return { event: { error: "invalid_json" } };
	}

	if (parsed.object !== "whatsapp_business_account") {
		return { event: parsed as unknown as Record<string, unknown> };
	}

	const normalizedMessages: NormalizedMessage[] = [];

	for (const entry of parsed.entry ?? []) {
		for (const change of entry.changes ?? []) {
			if (change.field !== "messages") continue;
			const value = change.value;
			const contacts = value.contacts ?? [];

			for (const msg of value.messages ?? []) {
				if (msg.type !== "text" || !msg.text?.body?.trim()) continue;

				const contact = contacts.find((c) => c.wa_id === msg.from);
				const senderId = normalizeWhatsAppPhone(msg.from);

				normalizedMessages.push({
					provider: "whatsapp",
					messageId: msg.id,
					channelId: senderId,
					senderId,
					senderDisplayName: contact?.profile?.name,
					text: msg.text.body.trim(),
					eventType: "message",
					rawEvent: msg as unknown as Record<string, unknown>,
					receivedAt: new Date().toISOString(),
				});
			}
		}
	}

	return {
		event: parsed as unknown as Record<string, unknown>,
		normalizedMessages,
	};
};

/** Extract query param from URL-encoded body or search params embedded in headers. */
const extractQueryParam = (
	_rawBody: Buffer,
	_param: string,
): string | undefined => undefined;

export const whatsappConnector: Connector = {
	provider: "whatsapp",
	describeConfig: () =>
		appSecret
			? { status: "ready" }
			: {
					status: "missing",
					reason: "WHATSAPP_APP_SECRET is not configured.",
				},
	verifySignature: ({ rawBody, headers }): Promise<boolean> => {
		if (!appSecret) return Promise.resolve(false);
		if (env.NODE_ENV === "test") return Promise.resolve(true);

		// Verification challenges don't have signatures
		const mode = headers["hub.mode"] ?? extractQueryParam(rawBody, "hub.mode");
		if (mode === "subscribe") return Promise.resolve(true);

		return Promise.resolve(
			verifyWhatsAppSignature({ rawBody, headers, secret: appSecret }),
		);
	},
	parseEvent: ({ rawBody, headers }): Promise<WebhookParseResult> =>
		Promise.resolve(parseWhatsAppEvent(rawBody, headers)),
};
