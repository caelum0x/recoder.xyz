import { and, eq } from "drizzle-orm";
import {
	type AlertChannel,
	type AlertConfigEmail,
	type AlertConfigSlack,
	type AlertEventType,
	alertSubscriptions,
	db,
} from "@/db";
import { notifyTeam } from "@/lib/agency/channel-notifier";
import { sendEmail } from "@/services/external/email";

export type AlertPayload = {
	eventType: AlertEventType;
	title: string;
	details: string;
	items: Array<{ label: string; value: string }>;
};

export async function sendAlert(
	teamDbId: number,
	payload: AlertPayload,
): Promise<void> {
	const subs = await db
		.select()
		.from(alertSubscriptions)
		.where(
			and(
				eq(alertSubscriptions.teamDbId, teamDbId),
				eq(alertSubscriptions.eventType, payload.eventType),
				eq(alertSubscriptions.isActive, true),
			),
		);

	for (const sub of subs) {
		try {
			if (sub.channel === "email") {
				await sendEmailAlert(sub.config as AlertConfigEmail, payload);
			} else if (sub.channel === "slack") {
				await sendSlackWebhook(
					(sub.config as AlertConfigSlack).webhookUrl,
					payload,
				);
			}
		} catch (error) {
			console.error(
				`Alert dispatch failed for subscription ${sub.id} (${sub.channel}):`,
				error,
			);
		}
	}

	// Also fan out to all linked channels for the team
	try {
		const channelMessage = [
			`[${payload.eventType}] ${payload.title}`,
			payload.details,
			...payload.items.map((item) => `${item.label}: ${item.value}`),
		].join("\n");
		await notifyTeam(teamDbId, channelMessage);
	} catch (error) {
		console.error(`Channel alert fan-out failed for team ${teamDbId}:`, error);
	}
}

async function sendEmailAlert(
	config: AlertConfigEmail,
	payload: AlertPayload,
): Promise<void> {
	const body = [
		payload.title,
		"",
		payload.details,
		"",
		...payload.items.map((item) => `${item.label}: ${item.value}`),
	].join("\n");

	await sendEmail(`[Alert] ${payload.title}`, body, config.recipients);
}

function isAllowedWebhookUrl(raw: string): boolean {
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:") return false;
		const blocked = [
			"localhost",
			"127.0.0.1",
			"0.0.0.0",
			"[::1]",
			"metadata.google.internal",
		];
		if (blocked.includes(url.hostname)) return false;
		if (url.hostname.startsWith("10.")) return false;
		if (url.hostname.startsWith("172.")) return false;
		if (url.hostname.startsWith("192.168.")) return false;
		if (url.hostname.startsWith("169.254.")) return false;
		if (url.hostname.endsWith(".internal") || url.hostname.endsWith(".local"))
			return false;
		return true;
	} catch {
		return false;
	}
}

export async function sendSlackWebhook(
	webhookUrl: string,
	payload: AlertPayload,
): Promise<void> {
	if (!isAllowedWebhookUrl(webhookUrl)) {
		throw new Error("Webhook URL is not allowed");
	}

	const blocks = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: payload.title,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: payload.details,
			},
		},
	];

	if (payload.items.length > 0) {
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: payload.items
					.map((item) => `*${item.label}:* ${item.value}`)
					.join("\n"),
			},
		});
	}

	await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ blocks }),
	});
}
