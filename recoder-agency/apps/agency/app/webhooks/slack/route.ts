import { after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, flowTriggers } from "@/db";
import { giselle, githubWebhookCallbacks } from "@/app/giselle";
import { logger } from "@/lib/logger";

export const maxDuration = 800;
export const runtime = "nodejs";

interface SlackWebhookPayload {
	userId: string;
	channelId: string;
	text: string;
	timestamp: string;
	threadTs?: string;
	isMention?: boolean;
}

type SlackTriggerExecutor = typeof giselle & {
	handleSlackTrigger: (args: {
		trigger: unknown;
		payload: SlackWebhookPayload;
		onGenerationComplete?: typeof githubWebhookCallbacks.onGenerationComplete;
		onGenerationError?: typeof githubWebhookCallbacks.onGenerationError;
		onTaskCreate?: typeof githubWebhookCallbacks.onTaskCreate;
	}) => Promise<void>;
};

/**
 * Slack Events API handler.
 *
 * Handles two event types:
 * - url_verification: Slack challenge-response for endpoint registration
 * - event_callback: Actual Slack events (messages, mentions)
 */
export async function POST(req: Request) {
	const rawBody = await req.text();
	const body = rawBody ? JSON.parse(rawBody) : {};

	const verification = verifySlackRequest(req, rawBody);
	if (!verification.ok) {
		return new Response(
			JSON.stringify({ error: "Invalid Slack signature" }),
			{ status: 401, headers: { "Content-Type": "application/json" } },
		);
	}

	// Handle Slack url_verification challenge
	if (body.type === "url_verification") {
		return new Response(JSON.stringify({ challenge: body.challenge }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (body.type !== "event_callback") {
		return new Response(JSON.stringify({ received: true }), { status: 200 });
	}

	logger.info(
		{ eventType: body.event?.type },
		"[slack-webhook] Received event",
	);

	const event = body.event;
	if (!event) {
		return new Response(JSON.stringify({ received: true }), { status: 200 });
	}

	// Only handle message events (not bot messages to avoid loops) and app_mention
	const isMessage =
		event.type === "message" && !event.bot_id && !event.subtype;
	const isMention = event.type === "app_mention";

	if (!isMessage && !isMention) {
		return new Response(JSON.stringify({ received: true }), { status: 200 });
	}

	const channelId: string = event.channel;
	const payload: SlackWebhookPayload = {
		userId: event.user ?? "",
		channelId,
		text: event.text ?? "",
		timestamp: event.ts ?? "",
		threadTs: event.thread_ts,
		isMention,
	};

	logger.info(
		{ userId: payload.userId, channelId },
		`[slack-webhook] Processing ${isMention ? "mention" : "message"}`,
	);

	// Resolve matching Slack triggers and dispatch in the background
	after(async () => {
		try {
			await dispatchSlackEvent(payload);
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			logger.error({ error: msg }, "[slack-webhook] Dispatch failed");
		}
	});

	return new Response(JSON.stringify({ received: true }), { status: 200 });
}

function verifySlackRequest(
	req: Request,
	rawBody: string,
): { ok: boolean } {
	const signingSecret = process.env.SLACK_SIGNING_SECRET;
	if (!signingSecret) {
		logger.warn(
			"[slack-webhook] SLACK_SIGNING_SECRET is not configured; rejecting webhook",
		);
		return { ok: false };
	}

	const signature = req.headers.get("x-slack-signature") ?? "";
	const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
	if (!signature || !timestamp) {
		return { ok: false };
	}

	const tsNumber = Number(timestamp);
	if (!Number.isFinite(tsNumber)) {
		return { ok: false };
	}

	// Reject replayed requests older than 5 minutes.
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - tsNumber) > 60 * 5) {
		return { ok: false };
	}

	const base = `v0:${timestamp}:${rawBody}`;
	const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

	const expectedBuf = Buffer.from(expected);
	const signatureBuf = Buffer.from(signature);
	if (expectedBuf.length !== signatureBuf.length) {
		return { ok: false };
	}

	return { ok: timingSafeEqual(expectedBuf, signatureBuf) };
}

/**
 * Look up all flow triggers from the DB, filter to Slack triggers matching
 * the incoming channelId, and start a task for each.
 */
async function dispatchSlackEvent(payload: SlackWebhookPayload): Promise<void> {
	const giselleWithSlack = giselle as SlackTriggerExecutor;

	// Fetch all flow triggers from DB
	const allFlowTriggers = await db.select().from(flowTriggers);

	let matchCount = 0;

	for (const row of allFlowTriggers) {
		// Load trigger data from blob storage
		const trigger = await giselle.getTrigger({
			triggerId: row.sdkFlowTriggerId,
		});
		if (!trigger) continue;
		if (!trigger.enable) continue;

		// Only match Slack triggers configured for this channel
		if (trigger.configuration.provider !== "slack") continue;
		if (trigger.configuration.channelId !== payload.channelId) continue;

		// Match event type: message triggers for messages, mention triggers for mentions
		const eventId = trigger.configuration.event.id;
		if (payload.isMention && eventId !== "slack.mention.received") continue;
		if (!payload.isMention && eventId !== "slack.message.received") continue;

		matchCount++;

		try {
			await giselleWithSlack.handleSlackTrigger({
				trigger,
				payload,
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
				"[slack-webhook] Trigger execution failed",
			);
		}
	}

	if (matchCount === 0) {
		logger.info(
			{ channelId: payload.channelId },
			"[slack-webhook] No matching triggers found",
		);
	} else {
		logger.info(
			{ channelId: payload.channelId, matchCount },
			"[slack-webhook] Dispatched to triggers",
		);
	}
}
