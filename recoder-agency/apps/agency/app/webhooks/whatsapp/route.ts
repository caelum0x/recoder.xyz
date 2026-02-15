import { after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, flowTriggers } from "@/db";
import { giselle, githubWebhookCallbacks } from "@/app/giselle";
import { logger } from "@/lib/logger";

export const maxDuration = 800;
export const runtime = "nodejs";

interface WhatsAppMessage {
	from: string;
	id: string;
	timestamp: string;
	type: string;
	text?: { body: string };
	image?: { id: string; caption?: string };
}

/**
 * WhatsApp webhook verification (Meta challenge-response).
 */
export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const mode = searchParams.get("hub.mode");
	const token = searchParams.get("hub.verify_token");
	const challenge = searchParams.get("hub.challenge");

	const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

	if (mode === "subscribe" && token === verifyToken) {
		logger.info("[whatsapp-webhook] Verification successful");
		return new Response(challenge, { status: 200 });
	}

	logger.warn("[whatsapp-webhook] Verification failed");
	return new Response("Forbidden", { status: 403 });
}

/**
 * WhatsApp incoming message handler.
 *
 * Parses the Meta Cloud API webhook payload, extracts text messages,
 * and dispatches to matching flow triggers in the background.
 */
export async function POST(req: Request) {
	const rawBody = await req.text();
	const body = rawBody ? JSON.parse(rawBody) : {};

	const verification = verifyWhatsAppRequest(req, rawBody);
	if (!verification.ok) {
		return new Response(
			JSON.stringify({ error: "Invalid signature" }),
			{ status: 401, headers: { "Content-Type": "application/json" } },
		);
	}

	// Extract messages from WhatsApp Cloud API payload
	const entry = body?.entry?.[0];
	const changes = entry?.changes?.[0];
	const value = changes?.value;
	const messages: WhatsAppMessage[] | undefined = value?.messages;
	const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;

	if (!messages || messages.length === 0) {
		return new Response(JSON.stringify({ received: true }), { status: 200 });
	}

	logger.info(
		{ messageCount: messages.length, phoneNumberId },
		"[whatsapp-webhook] Received messages",
	);

	// Dispatch in the background so we return 200 quickly
	after(async () => {
		for (const message of messages) {
			if (message.type !== "text" || !message.text?.body) continue;

			try {
				await dispatchWhatsAppMessage({
					from: message.from,
					body: message.text.body,
					timestamp: message.timestamp,
					phoneNumberId,
				});
			} catch (error) {
				const msg =
					error instanceof Error ? error.message : "Unknown error";
				logger.error({ error: msg }, "[whatsapp-webhook] Dispatch failed");
			}
		}
	});

	return new Response(JSON.stringify({ received: true }), { status: 200 });
}

/**
 * Verify the webhook came from Meta using the app secret HMAC.
 */
function verifyWhatsAppRequest(
	req: Request,
	rawBody: string,
): { ok: boolean } {
	const appSecret = process.env.WHATSAPP_APP_SECRET;
	if (!appSecret) {
		logger.warn(
			"[whatsapp-webhook] WHATSAPP_APP_SECRET is not configured; rejecting webhook",
		);
		return { ok: false };
	}

	const signature = req.headers.get("x-hub-signature-256") ?? "";
	if (!signature) {
		return { ok: false };
	}

	const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;

	const expectedBuf = Buffer.from(expected);
	const signatureBuf = Buffer.from(signature);
	if (expectedBuf.length !== signatureBuf.length) {
		return { ok: false };
	}

	return { ok: timingSafeEqual(expectedBuf, signatureBuf) };
}

/**
 * Look up all flow triggers from the DB, filter to WhatsApp triggers matching
 * the incoming phoneNumberId, and start a task for each.
 */
async function dispatchWhatsAppMessage(payload: {
	from: string;
	body: string;
	timestamp: string;
	phoneNumberId?: string;
}): Promise<void> {
	const giselleWithWhatsApp = giselle as typeof giselle & {
		handleWhatsAppTrigger: (args: {
			trigger: unknown;
			payload: {
				from: string;
				body: string;
				timestamp: string;
				phoneNumberId?: string;
			};
			onGenerationComplete?: typeof githubWebhookCallbacks.onGenerationComplete;
			onGenerationError?: typeof githubWebhookCallbacks.onGenerationError;
			onTaskCreate?: typeof githubWebhookCallbacks.onTaskCreate;
		}) => Promise<void>;
	};

	const allFlowTriggers = await db.select().from(flowTriggers);

	let matchCount = 0;

	for (const row of allFlowTriggers) {
		const trigger = await giselle.getTrigger({
			triggerId: row.sdkFlowTriggerId,
		});
		if (!trigger) continue;
		if (!trigger.enable) continue;

		// Only match WhatsApp triggers
		if (trigger.configuration.provider !== "whatsapp") continue;

		// Match by phoneNumberId if configured
		if (
			payload.phoneNumberId &&
			trigger.configuration.phoneNumberId !== payload.phoneNumberId
		) {
			continue;
		}

		matchCount++;

		try {
				await giselleWithWhatsApp.handleWhatsAppTrigger({
					trigger,
					payload: {
					from: payload.from,
					body: payload.body,
					timestamp: payload.timestamp,
					phoneNumberId: payload.phoneNumberId,
				},
				onGenerationComplete: githubWebhookCallbacks.onGenerationComplete,
				onGenerationError: githubWebhookCallbacks.onGenerationError,
				onTaskCreate: githubWebhookCallbacks.onTaskCreate,
			});
		} catch (error) {
			logger.error(
				{
					triggerId: trigger.id,
					workspaceId: trigger.workspaceId,
					error: error instanceof Error ? error.message : String(error),
				},
				"[whatsapp-webhook] Trigger execution failed",
			);
		}
	}

	if (matchCount === 0) {
		logger.info(
			{ phoneNumberId: payload.phoneNumberId },
			"[whatsapp-webhook] No matching triggers found",
		);
	} else {
		logger.info(
			{ phoneNumberId: payload.phoneNumberId, matchCount },
			"[whatsapp-webhook] Dispatched to triggers",
		);
	}
}
