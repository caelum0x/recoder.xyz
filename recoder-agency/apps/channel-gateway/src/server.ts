import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { URL } from "node:url";
import { startDiscordBot } from "./connectors/discord-bot.js";
import type { ProviderId } from "./connectors/types.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { handleOutbound } from "./outbound.js";
import { handleWebhook } from "./webhooks/router.js";
import { handleSlackAction } from "./webhooks/slack-actions.js";

const parseProvider = (pathname: string): ProviderId | null => {
	const match = pathname.match(/^\/webhooks\/([^/]+)$/);
	if (!match) return null;
	const provider = match[1] as ProviderId;
	return ["slack", "whatsapp", "telegram", "discord"].includes(provider)
		? provider
		: null;
};

const server = createServer(async (req, res) => {
	const requestId = randomUUID();
	res.setHeader("x-request-id", requestId);
	const url = new URL(req.url ?? "/", "http://localhost");

	if (req.method === "GET" && url.pathname === "/healthz") {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				ok: true,
				service: "channel-gateway",
				time: new Date().toISOString(),
			}),
		);
		return;
	}

	// WhatsApp webhook verification is a GET request
	if (req.method === "GET" && url.pathname === "/webhooks/whatsapp") {
		const mode = url.searchParams.get("hub.mode");
		const token = url.searchParams.get("hub.verify_token");
		const challenge = url.searchParams.get("hub.challenge");

		if (
			mode === "subscribe" &&
			env.WHATSAPP_VERIFY_TOKEN &&
			token === env.WHATSAPP_VERIFY_TOKEN &&
			challenge
		) {
			res.writeHead(200, { "content-type": "text/plain" });
			res.end(challenge);
		} else {
			res.writeHead(403, { "content-type": "text/plain" });
			res.end("Forbidden");
		}
		return;
	}

	if (req.method === "POST") {
		try {
			if (url.pathname === "/webhooks/slack/actions") {
				await handleSlackAction(req, res);
				return;
			}

			if (url.pathname === "/api/send") {
				await handleOutbound(req, res, requestId);
				return;
			}

			const provider = parseProvider(url.pathname);
			if (provider) {
				await handleWebhook(provider, req, res, requestId);
				return;
			}
		} catch (error) {
			if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
				res.writeHead(413, { "content-type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "payload_too_large" }));
				return;
			}
			throw error;
		}
	}

	res.writeHead(404, { "content-type": "application/json" });
	res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

server.listen(env.CHANNEL_GATEWAY_PORT, () => {
	logger.info(
		{
			port: env.CHANNEL_GATEWAY_PORT,
			publicUrl: env.CHANNEL_GATEWAY_PUBLIC_URL,
		},
		"Channel Gateway listening",
	);
});

// Graceful shutdown
const shutdown = () => {
	logger.info("Shutting down channel gateway…");
	server.close(() => {
		logger.info("Channel gateway closed");
		process.exit(0);
	});
	// Force exit after 10s
	setTimeout(() => {
		logger.warn("Forced shutdown after timeout");
		process.exit(1);
	}, 10_000).unref();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

// Start Discord bot alongside HTTP server
startDiscordBot().catch((error) => {
	logger.error({ error: String(error) }, "Failed to start Discord bot");
});
