"use server";

import { render } from "@react-email/components";
import { and, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	clientDigestSchedules,
	clients,
	db,
	deliverables,
	projects,
} from "@/db";
import { ClientDigestEmail } from "@/emails/transactional/client-digest";
import { notifyClient } from "@/lib/agency/channel-notifier";
import { sendEmail } from "@/services/external/email";

export async function sendClientDigest(clientDbId: number, teamDbId: number) {
	const client = await db.query.clients.findFirst({
		where: and(eq(clients.dbId, clientDbId), eq(clients.teamDbId, teamDbId)),
	});
	if (!client?.email) {
		return;
	}

	const clientProjects = await db
		.select({
			id: projects.id,
			name: projects.name,
			status: projects.status,
			dbId: projects.dbId,
		})
		.from(projects)
		.where(
			and(eq(projects.clientDbId, clientDbId), eq(projects.teamDbId, teamDbId)),
		);

	if (clientProjects.length === 0) {
		return;
	}

	const projectSummaries = await Promise.all(
		clientProjects.map(async (project) => {
			const oneWeekAgo = new Date();
			oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

			const recentDeliverableRows = await db
				.select({ name: deliverables.name })
				.from(deliverables)
				.where(
					and(
						eq(deliverables.projectDbId, project.dbId),
						sql`${deliverables.updatedAt} >= ${oneWeekAgo}`,
					),
				)
				.limit(5);

			const pendingRows = await db
				.select({ dbId: deliverables.dbId })
				.from(deliverables)
				.where(
					and(
						eq(deliverables.projectDbId, project.dbId),
						eq(deliverables.status, "pending_review"),
					),
				);

			const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/projects/${project.id}`;

			return {
				name: project.name,
				status: project.status,
				recentDeliverables: recentDeliverableRows.map((d) => d.name),
				pendingDecisions: pendingRows.length,
				portalUrl,
			};
		}),
	);

	const portalBaseUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/projects`;

	const html = await render(
		ClientDigestEmail({
			clientName: client.name,
			projects: projectSummaries,
			portalBaseUrl,
		}),
	);

	await sendEmail(
		`Weekly Project Update — ${client.name}`,
		`Your weekly project status update is ready. Visit your portal for details.`,
		[{ userDisplayName: client.name, userEmail: client.email }],
		{ html },
	);

	// Also send a summary via linked messaging channels
	const channelParts = [`Weekly update for ${client.name}:`, ""];
	for (const summary of projectSummaries) {
		const pending =
			summary.pendingDecisions > 0
				? ` (${summary.pendingDecisions} awaiting review)`
				: "";
		channelParts.push(`- ${summary.name}: ${summary.status}${pending}`);
		if (summary.recentDeliverables.length > 0) {
			channelParts.push(`  Recent: ${summary.recentDeliverables.join(", ")}`);
		}
	}
	channelParts.push("", "Check your portal for details.");

	try {
		await notifyClient(clientDbId, channelParts.join("\n"));
	} catch (channelError) {
		// Channel delivery is best-effort; email is the primary channel
		console.error("Channel digest delivery failed:", channelError);
	}

	await db
		.update(clientDigestSchedules)
		.set({ lastSentAt: new Date() })
		.where(
			and(
				eq(clientDigestSchedules.teamDbId, teamDbId),
				eq(clientDigestSchedules.clientDbId, clientDbId),
			),
		);
}

export async function processDigestBatch(teamDbId: number) {
	const dueSchedules = await db
		.select({
			clientDbId: clientDigestSchedules.clientDbId,
		})
		.from(clientDigestSchedules)
		.where(
			and(
				eq(clientDigestSchedules.teamDbId, teamDbId),
				eq(clientDigestSchedules.isActive, true),
				or(
					sql`${clientDigestSchedules.lastSentAt} IS NULL`,
					sql`${clientDigestSchedules.lastSentAt} < now() - interval '6 days'`,
				),
			),
		);

	for (const schedule of dueSchedules) {
		try {
			await sendClientDigest(schedule.clientDbId, teamDbId);
		} catch (error) {
			console.error(
				`Failed to send digest for client ${schedule.clientDbId}:`,
				error,
			);
		}
	}
}

export async function toggleClientDigest(
	clientDbId: number,
	teamDbId: number,
	isActive: boolean,
) {
	const digestId = `cds_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

	await db
		.insert(clientDigestSchedules)
		.values({
			id: digestId,
			teamDbId,
			clientDbId,
			isActive,
		})
		.onConflictDoUpdate({
			target: [
				clientDigestSchedules.teamDbId,
				clientDigestSchedules.clientDbId,
			],
			set: { isActive },
		});

	revalidatePath(`/clients/${clientDbId}`);
}
