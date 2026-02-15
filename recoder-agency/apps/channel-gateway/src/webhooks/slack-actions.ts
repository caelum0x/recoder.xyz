import type { IncomingMessage, ServerResponse } from "node:http";
import { sendSlackMessage } from "../connectors/slack-send.js";
import { verifySlackSignature } from "../connectors/slack-verify.js";
import { env } from "../env.js";
import { headersToRecord, readBody } from "../http.js";
import { logger } from "../logger.js";

type SlackActionPayload = {
	type?: string;
	trigger_id?: string;
	user?: { id?: string };
	channel?: { id?: string };
	message?: { ts?: string };
	actions?: Array<{ action_id?: string; value?: string }>;
	view?: {
		id?: string;
		private_metadata?: string;
		state?: {
			values?: Record<
				string,
				Record<string, { type?: string; value?: string }>
			>;
		};
	};
};

const parseSlackActionPayload = (
	rawBody: Buffer,
): SlackActionPayload | null => {
	const params = new URLSearchParams(rawBody.toString("utf8"));
	const payload = params.get("payload");
	if (!payload) return null;
	return JSON.parse(payload) as SlackActionPayload;
};

export const handleSlackAction = async (
	req: IncomingMessage,
	res: ServerResponse,
) => {
	const rawBody = await readBody(req);
	const headers = headersToRecord(req.headers);

	if (!env.SLACK_SIGNING_SECRET) {
		res.writeHead(501, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: false, error: "slack_not_configured" }));
		return;
	}

	const signatureOk = verifySlackSignature({
		rawBody,
		headers,
		signingSecret: env.SLACK_SIGNING_SECRET,
	});

	if (!signatureOk) {
		res.writeHead(401, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: false, error: "invalid_signature" }));
		return;
	}

	const payload = parseSlackActionPayload(rawBody);
	if (!payload) {
		res.writeHead(400, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: false, error: "invalid_payload" }));
		return;
	}

	const action = payload.actions?.[0];
	const channelId = payload.channel?.id;
	const userId = payload.user?.id;
	const messageTs = payload.message?.ts;

	if (payload.type === "view_submission") {
		const metadata = payload.view?.private_metadata;
		const parsed = metadata ? JSON.parse(metadata) : null;
		const token = parsed?.token as string | undefined;
		const modalChannelId = parsed?.channelId as string | undefined;
		const modalMessageTs = parsed?.messageTs as string | undefined;
		const modalUserId = payload.user?.id;
		const values = payload.view?.state?.values ?? {};
		const reasonField =
			Object.values(values)[0] &&
			Object.values(Object.values(values)[0])[0]?.value;

		if (!reasonField || !token || !modalChannelId || !modalUserId) {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					response_action: "errors",
					errors: {
						reason: "Please provide a reason.",
					},
				}),
			);
			return;
		}

		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: true }));

		if (!env.CHANNEL_GATEWAY_AGENCY_URL || !env.CHANNEL_GATEWAY_SHARED_SECRET) {
			return;
		}

		try {
			const response = await fetch(
				`${env.CHANNEL_GATEWAY_AGENCY_URL}/api/channel-gateway/actions`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-channel-gateway-secret": env.CHANNEL_GATEWAY_SHARED_SECRET,
					},
					body: JSON.stringify({
						provider: "slack",
						userId: modalUserId,
						channelId: modalChannelId,
						messageTs: modalMessageTs,
						actionId: "modal_submit",
						actionValue: token,
						reason: reasonField,
					}),
				},
			);

			const payload = (await response.json().catch(() => null)) as {
				replyText?: string;
				replyBlocks?: Array<Record<string, unknown>>;
			} | null;
			if (!payload?.replyText && !payload?.replyBlocks) {
				return;
			}

			await sendSlackMessage({
				channel: modalChannelId,
				text: payload.replyText ?? "Update",
				thread_ts: modalMessageTs,
				blocks: payload.replyBlocks,
			});
		} catch (error) {
			logger.error({ error: String(error) }, "Failed to handle Slack modal");
		}
		return;
	}

	res.writeHead(200, { "content-type": "application/json" });
	res.end(JSON.stringify({ ok: true }));

	if (
		!env.CHANNEL_GATEWAY_AGENCY_URL ||
		!env.CHANNEL_GATEWAY_SHARED_SECRET ||
		!action?.value ||
		!channelId ||
		!userId
	) {
		logger.warn("Slack action skipped (missing config or action metadata).");
		return;
	}

	if (
		action.action_id?.startsWith("reject_") &&
		action.action_id.endsWith("_modal") &&
		payload.trigger_id
	) {
		const modalTitle =
			action.action_id === "reject_deliverable_modal"
				? "Reject deliverable"
				: action.action_id === "reject_change_order_modal"
					? "Reject change order"
					: "Reject milestone";
		const metadata = JSON.stringify({
			token: action.value,
			channelId,
			messageTs,
		});

		await fetch("https://slack.com/api/views.open", {
			method: "POST",
			headers: {
				authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
				"content-type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({
				trigger_id: payload.trigger_id,
				view: {
					type: "modal",
					callback_id: "reject_reason",
					private_metadata: metadata,
					title: { type: "plain_text", text: modalTitle },
					submit: { type: "plain_text", text: "Submit" },
					close: { type: "plain_text", text: "Cancel" },
					blocks: [
						{
							type: "input",
							block_id: "reason",
							label: { type: "plain_text", text: "Reason" },
							element: {
								type: "plain_text_input",
								action_id: "reason",
								multiline: true,
							},
						},
					],
				},
			}),
		});
		return;
	}

	try {
		const response = await fetch(
			`${env.CHANNEL_GATEWAY_AGENCY_URL}/api/channel-gateway/actions`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-channel-gateway-secret": env.CHANNEL_GATEWAY_SHARED_SECRET,
				},
				body: JSON.stringify({
					provider: "slack",
					userId,
					channelId,
					messageTs,
					actionId: action.action_id ?? "",
					actionValue: action.value,
				}),
			},
		);

		const payload = (await response.json().catch(() => null)) as {
			replyText?: string;
			replyBlocks?: Array<Record<string, unknown>>;
		} | null;
		if (!payload?.replyText && !payload?.replyBlocks) {
			return;
		}

		await sendSlackMessage({
			channel: channelId,
			text: payload.replyText ?? "Update",
			thread_ts: messageTs,
			blocks: payload.replyBlocks,
		});
	} catch (error) {
		logger.error({ error: String(error) }, "Failed to dispatch Slack action");
	}
};
