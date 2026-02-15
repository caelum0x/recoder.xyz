import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendDiscordMessage } from "./connectors/discord-send.js";
import { sendSlackMessage } from "./connectors/slack-send.js";
import { sendTelegramMessage } from "./connectors/telegram-send.js";
import type { ProviderId } from "./connectors/types.js";
import { sendWhatsAppMessage } from "./connectors/whatsapp-send.js";
import { env } from "./env.js";
import { readBody } from "./http.js";
import { logger } from "./logger.js";

type OutboundPayload = {
	provider: ProviderId;
	channelId: string;
	text: string;
	threadId?: string;
	blocks?: Array<Record<string, unknown>>;
};

export const handleOutbound = async (
	req: IncomingMessage,
	res: ServerResponse,
	requestId?: string,
): Promise<void> => {
	const reqLogger = requestId ? logger.child({ requestId }) : logger;
	const secret = env.CHANNEL_GATEWAY_SHARED_SECRET;
	const provided = req.headers["x-channel-gateway-secret"] as
		| string
		| undefined;
	const secretBuf = secret ? Buffer.from(secret) : null;
	const providedBuf = provided ? Buffer.from(provided) : null;
	if (
		!secretBuf ||
		!providedBuf ||
		secretBuf.length !== providedBuf.length ||
		!timingSafeEqual(secretBuf, providedBuf)
	) {
		res.writeHead(401, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
		return;
	}

	const rawBody = await readBody(req);
	let payload: OutboundPayload;
	try {
		payload = JSON.parse(rawBody.toString("utf8")) as OutboundPayload;
	} catch {
		res.writeHead(400, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
		return;
	}

	if (!payload.provider || !payload.channelId || !payload.text) {
		res.writeHead(400, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: false, error: "missing_required_fields" }));
		return;
	}

	try {
		switch (payload.provider) {
			case "slack":
				await sendSlackMessage({
					channel: payload.channelId,
					text: payload.text,
					thread_ts: payload.threadId,
					blocks: payload.blocks,
				});
				break;
			case "whatsapp":
				await sendWhatsAppMessage({
					to: payload.channelId,
					text: payload.text,
				});
				break;
			case "telegram":
				await sendTelegramMessage({
					chatId: payload.channelId,
					text: payload.text,
					replyToMessageId: payload.threadId,
				});
				break;
			case "discord":
				await sendDiscordMessage({
					channelId: payload.channelId,
					text: payload.text,
				});
				break;
			default: {
				res.writeHead(400, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						ok: false,
						error: "unsupported_provider",
					}),
				);
				return;
			}
		}

		reqLogger.info(
			{ provider: payload.provider, channelId: payload.channelId },
			"Outbound message sent",
		);
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: true }));
	} catch (error) {
		reqLogger.error(
			{
				provider: payload.provider,
				channelId: payload.channelId,
				error: String(error),
			},
			"Outbound message failed",
		);
		res.writeHead(502, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: false, error: "send_failed" }));
	}
};
