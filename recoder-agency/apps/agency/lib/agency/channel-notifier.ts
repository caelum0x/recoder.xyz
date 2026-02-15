import { eq } from "drizzle-orm";
import { channelIdentities, db } from "@/db";

const gatewayUrl = () => process.env.CHANNEL_GATEWAY_URL?.trim();
const gatewaySecret = () => process.env.CHANNEL_GATEWAY_SHARED_SECRET?.trim();

type NotifyOptions = {
	threadId?: string;
};

/**
 * Send a message to a specific provider channel via the channel gateway.
 */
async function sendToGateway(params: {
	provider: string;
	channelId: string;
	text: string;
	threadId?: string;
}): Promise<void> {
	const url = gatewayUrl();
	const secret = gatewaySecret();
	if (!url || !secret) return;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);
	try {
		await fetch(`${url}/api/send`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-channel-gateway-secret": secret,
			},
			body: JSON.stringify({
				provider: params.provider,
				channelId: params.channelId,
				text: params.text,
				threadId: params.threadId,
			}),
			signal: controller.signal,
		});
	} catch (error) {
		console.error(
			`Channel notify failed (${params.provider}/${params.channelId}):`,
			error,
		);
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Notify a client on all their linked channels.
 */
export async function notifyClient(
	clientDbId: number,
	message: string,
	opts?: NotifyOptions,
): Promise<void> {
	const identities = await db
		.select({
			provider: channelIdentities.provider,
			providerChannelId: channelIdentities.providerChannelId,
			providerUserId: channelIdentities.providerUserId,
		})
		.from(channelIdentities)
		.where(eq(channelIdentities.clientDbId, clientDbId));

	for (const identity of identities) {
		// For WhatsApp and Telegram, use providerUserId as channelId (DM)
		// For Slack and Discord, use providerChannelId if available
		const channelId = identity.providerChannelId ?? identity.providerUserId;
		if (!channelId) continue;

		await sendToGateway({
			provider: identity.provider,
			channelId,
			text: message,
			threadId: opts?.threadId,
		});
	}
}

/**
 * Notify all clients on a team (for admin/team alerts).
 */
export async function notifyTeam(
	teamDbId: number,
	message: string,
): Promise<void> {
	const identities = await db
		.select({
			provider: channelIdentities.provider,
			providerChannelId: channelIdentities.providerChannelId,
			providerUserId: channelIdentities.providerUserId,
		})
		.from(channelIdentities)
		.where(eq(channelIdentities.teamDbId, teamDbId));

	const seen = new Set<string>();
	for (const identity of identities) {
		const channelId = identity.providerChannelId ?? identity.providerUserId;
		if (!channelId) continue;

		const key = `${identity.provider}:${channelId}`;
		if (seen.has(key)) continue;
		seen.add(key);

		await sendToGateway({
			provider: identity.provider,
			channelId,
			text: message,
		});
	}
}
