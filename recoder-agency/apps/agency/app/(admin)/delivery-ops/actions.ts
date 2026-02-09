"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	type AlertChannel,
	type AlertConfig,
	type AlertEventType,
	alertSubscriptions,
	db,
} from "@/db";
import { updateTeamCapacitySettings } from "@/lib/agency/team-capacity";
import { fetchCurrentTeam } from "@/services/teams";

export async function saveCapacitySettings(formData: FormData) {
	const team = await fetchCurrentTeam();
	const maxConcurrentProjects = Math.max(
		1,
		Math.min(100, Number(formData.get("maxConcurrentProjects")) || 10),
	);
	const maxConcurrentPerMember = Math.max(
		1,
		Math.min(50, Number(formData.get("maxConcurrentPerMember")) || 3),
	);

	await updateTeamCapacitySettings(team.dbId, {
		maxConcurrentProjects,
		maxConcurrentPerMember,
	});

	revalidatePath("/delivery-ops");
}

export async function createAlertSubscription(formData: FormData) {
	const team = await fetchCurrentTeam();
	const channel = String(formData.get("channel")) as AlertChannel;
	const eventType = String(formData.get("eventType")) as AlertEventType;

	if (!["email", "slack"].includes(channel)) {
		throw new Error("Invalid channel");
	}
	if (!["sla_breach", "stuck_project", "rework_spike"].includes(eventType)) {
		throw new Error("Invalid event type");
	}

	let config: AlertConfig;
	if (channel === "slack") {
		const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
		if (!webhookUrl) {
			throw new Error("Webhook URL is required for Slack alerts");
		}
		config = { webhookUrl };
	} else {
		const recipientEmail = String(formData.get("recipientEmail") ?? "").trim();
		const recipientName = String(formData.get("recipientName") ?? "").trim();
		if (!recipientEmail) {
			throw new Error("Recipient email is required for email alerts");
		}
		config = {
			recipients: [
				{
					userDisplayName: recipientName || recipientEmail,
					userEmail: recipientEmail,
				},
			],
		};
	}

	const id = `as_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

	await db.insert(alertSubscriptions).values({
		id,
		teamDbId: team.dbId,
		channel,
		eventType,
		config,
	});

	revalidatePath("/delivery-ops");
}

export async function toggleAlertSubscription(subscriptionDbId: number) {
	const team = await fetchCurrentTeam();

	const sub = await db.query.alertSubscriptions.findFirst({
		where: and(
			eq(alertSubscriptions.dbId, subscriptionDbId),
			eq(alertSubscriptions.teamDbId, team.dbId),
		),
	});

	if (!sub) {
		throw new Error("Subscription not found");
	}

	await db
		.update(alertSubscriptions)
		.set({ isActive: !sub.isActive })
		.where(eq(alertSubscriptions.dbId, subscriptionDbId));

	revalidatePath("/delivery-ops");
}

export async function deleteAlertSubscription(subscriptionDbId: number) {
	const team = await fetchCurrentTeam();

	await db
		.delete(alertSubscriptions)
		.where(
			and(
				eq(alertSubscriptions.dbId, subscriptionDbId),
				eq(alertSubscriptions.teamDbId, team.dbId),
			),
		);

	revalidatePath("/delivery-ops");
}
