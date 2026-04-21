import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	type ChannelProvider,
	changeOrders,
	channelGatewayEvents,
	channelIdentities,
	clients,
	db,
	deliverables,
	milestoneApprovals,
	type ProjectStatus,
	projects,
	quotes,
} from "@/db";
import { executeIntent } from "@/lib/agency/agent-orchestrator";
import {
	appendMessage,
	loadConversationHistory,
} from "@/lib/agency/conversation-store";
import {
	type DetectedIntent,
	detectIntent,
} from "@/lib/agency/intent-detector";
import { applyProjectTransitionWithAudit } from "@/lib/agency/project-transition";
import {
	normalizeProjectStatus,
	validateProjectStatusTransition,
} from "@/lib/agency/project-workflow";
import { maybeRefreshWeeklyDeliveryMetrics } from "@/lib/agency/weekly-delivery-metrics-refresh";
import { getAMBDispatcher } from "../../../../../../lib/amb-singleton";

const payloadSchema = z.object({
	provider: z.enum(["slack", "whatsapp", "telegram", "discord"]),
	messageId: z.string(),
	threadId: z.string().optional(),
	channelId: z.string(),
	channelType: z.string().optional(),
	senderId: z.string(),
	senderDisplayName: z.string().optional(),
	text: z.string(),
	eventType: z.string().optional(),
	rawEvent: z.record(z.string(), z.unknown()),
	receivedAt: z.string(),
});

const resolveSecret = () => process.env.CHANNEL_GATEWAY_SHARED_SECRET?.trim();
const resolveActionSecret = () =>
	process.env.CHANNEL_GATEWAY_SHARED_SECRET?.trim();

const recordGatewayEvent = async (params: {
	provider: ChannelProvider;
	eventType: string;
	action?: string;
	teamDbId?: number | null;
	clientDbId?: number | null;
	projectId?: string | null;
	payload?: Record<string, unknown>;
}) => {
	await db.insert(channelGatewayEvents).values({
		id: `cge_${crypto.randomUUID()}`,
		teamDbId: params.teamDbId ?? null,
		clientDbId: params.clientDbId ?? null,
		provider: params.provider,
		eventType: params.eventType,
		action: params.action ?? null,
		projectId: params.projectId ?? null,
		payload: params.payload ?? null,
	});
};

const parseCommand = (text: string) => {
	const trimmed = text.trim();
	const lower = trimmed.toLowerCase();
	const linkMatch = /^link\s+client[:\s]+(\S+)/i.exec(trimmed);
	if (linkMatch) {
		return { action: "link" as const, clientId: linkMatch[1] };
	}
	if (lower === "help" || lower.startsWith("help ")) {
		return { action: "help" as const };
	}
	const approveDeliverable = /^approve\s+deliverable[:\s]+(\S+)/i.exec(trimmed);
	if (approveDeliverable) {
		return {
			action: "approve_deliverable" as const,
			deliverableId: approveDeliverable[1],
		};
	}
	const rejectDeliverable =
		/^reject\s+deliverable[:\s]+(\S+)(?:\s+reason[:\s]+(.+))?/i.exec(trimmed);
	if (rejectDeliverable) {
		return {
			action: "reject_deliverable" as const,
			deliverableId: rejectDeliverable[1],
			reason: rejectDeliverable[2],
		};
	}
	const approveChangeOrder = /^approve\s+change\s*order[:\s]+(\S+)/i.exec(
		trimmed,
	);
	if (approveChangeOrder) {
		return {
			action: "approve_change_order" as const,
			changeOrderId: approveChangeOrder[1],
		};
	}
	const rejectChangeOrder =
		/^reject\s+change\s*order[:\s]+(\S+)(?:\s+reason[:\s]+(.+))?/i.exec(
			trimmed,
		);
	if (rejectChangeOrder) {
		return {
			action: "reject_change_order" as const,
			changeOrderId: rejectChangeOrder[1],
			reason: rejectChangeOrder[2],
		};
	}
	const approveMilestone = /^approve\s+milestone[:\s]+(.+)/i.exec(trimmed);
	if (approveMilestone) {
		return {
			action: "approve_milestone" as const,
			milestoneLabel: approveMilestone[1].trim(),
		};
	}
	const rejectMilestone =
		/^reject\s+milestone[:\s]+(.+?)(?:\s+reason[:\s]+(.+))?$/i.exec(trimmed);
	if (rejectMilestone) {
		return {
			action: "reject_milestone" as const,
			milestoneLabel: rejectMilestone[1].trim(),
			reason: rejectMilestone[2],
		};
	}
	if (lower.startsWith("brief:")) {
		return { action: "brief" as const, body: trimmed.slice(6).trim() };
	}
	if (lower.startsWith("revision:") || lower.startsWith("change:")) {
		return {
			action: "revision" as const,
			body: trimmed.replace(/^(revision|change):/i, "").trim(),
		};
	}
	if (lower.startsWith("list projects")) {
		return { action: "list_projects" as const };
	}
	if (lower.startsWith("status")) {
		return { action: "status" as const };
	}
	return { action: "ignore" as const };
};

const parseProjectId = (text: string) => {
	const match = /project[:\s]+([a-zA-Z0-9_-]+)/i.exec(text);
	return match?.[1];
};

const helpText =
	"Commands:\n" +
	"- `link client:<clientId>`\n" +
	"- `help`\n" +
	"- `approve deliverable:<id>`\n" +
	"- `reject deliverable:<id> reason:<text>`\n" +
	"- `approve milestone:<label>`\n" +
	"- `reject milestone:<label> reason:<text>`\n" +
	"- `approve change order:<id>`\n" +
	"- `reject change order:<id> reason:<text>`\n" +
	"- `brief: <text>`\n" +
	"- `revision: <text>` (optional `project:<id>`)\n" +
	"- `status` (optional `project:<id>`)\n" +
	"- `list projects` (or `list projects page 2`)\n";

function isAmbDispatchEnabled(): boolean {
	if (process.env.NODE_ENV === "test") return false;
	if (process.env.RECODER_A2A_AMB_DISABLED === "1") return false;
	return true;
}

const helpBlocks = [
	{
		type: "section",
		text: {
			type: "mrkdwn",
			text:
				"*Recoder Agency Commands*\n" +
				"• `link client:<clientId>`\n" +
				"• `brief: <text>`\n" +
				"• `revision: <text>` (optional `project:<id>`)\n" +
				"• `status` (optional `project:<id>`)\n" +
				"• `list projects` (or `list projects page 2`)\n" +
				"• `approve deliverable:<id>` / `reject deliverable:<id> reason:<text>`\n" +
				"• `approve milestone:<label>` / `reject milestone:<label> reason:<text>`\n" +
				"• `approve change order:<id>` / `reject change order:<id> reason:<text>`",
		},
	},
	{
		type: "context",
		elements: [
			{
				type: "mrkdwn",
				text: "In channels, mention the bot (e.g. `@Recoder help`) or DM directly.",
			},
		],
	},
];

const portalBaseUrl = () =>
	process.env.NEXT_PUBLIC_APP_URL?.trim() ||
	process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
	process.env.BETTER_AUTH_URL?.trim() ||
	"";

const buildProjectLink = (projectId: string) => {
	const base = portalBaseUrl();
	if (!base) return null;
	return `${base.replace(/\/$/, "")}/portal/projects/${projectId}`;
};

const formatProjectLink = (projectId: string) => {
	const link = buildProjectLink(projectId);
	return link ? `<${link}|View project>` : null;
};

const parseListProjectsPage = (text: string) => {
	const match = /list projects(?:\s+page)?\s+(\d+)/i.exec(text.trim());
	if (!match) return 1;
	const page = Number.parseInt(match[1], 10);
	return Number.isFinite(page) && page > 0 ? page : 1;
};

const createActionToken = (payload: Record<string, unknown>) => {
	const secret = resolveActionSecret();
	if (!secret) return null;
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = crypto
		.createHmac("sha256", secret)
		.update(body)
		.digest("base64url");
	return `${body}.${signature}`;
};

const buildActionButton = (params: {
	text: string;
	actionId: string;
	value: Record<string, unknown>;
	style?: "primary" | "danger";
}) => {
	const token = createActionToken(params.value);
	if (!token) return null;
	return {
		type: "button",
		text: { type: "plain_text", text: params.text },
		action_id: params.actionId,
		style: params.style,
		value: token,
	};
};

async function transitionProjectStatusIfValid({
	projectDbId,
	currentStatus,
	nextStatus,
	reason,
	deliverableId,
	bulk = false,
}: {
	projectDbId: number;
	currentStatus: ProjectStatus;
	nextStatus: ProjectStatus;
	reason: string;
	deliverableId?: string;
	bulk?: boolean;
}) {
	const fromStatus = normalizeProjectStatus(currentStatus);
	const toStatus = normalizeProjectStatus(nextStatus);
	if (fromStatus === toStatus) {
		return fromStatus;
	}

	const validation = validateProjectStatusTransition(fromStatus, toStatus);
	if (!validation.valid) {
		return fromStatus;
	}

	let didUpdate = false;
	await db.transaction(async (tx) => {
		const result = await applyProjectTransitionWithAudit(tx, {
			projectDbId,
			fromStatus,
			toStatus,
			actorUserDbId: null,
			reason,
			source: "channel.gateway",
			metadata: {
				deliverableId: deliverableId ?? null,
				bulk,
			},
		});
		didUpdate = result.applied;
	});
	if (didUpdate) {
		await maybeRefreshWeeklyDeliveryMetrics(
			"channel.gateway.transitionProjectStatusIfValid",
		);
	}

	return toStatus;
}

export async function POST(request: Request) {
	const secret = resolveSecret();
	const provided = request.headers.get("x-channel-gateway-secret");
	if (!secret || !provided || secret.length !== provided.length) {
		return new Response("Unauthorized", { status: 401 });
	}
	if (
		!crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
	) {
		return new Response("Unauthorized", { status: 401 });
	}

	const payload = payloadSchema.parse(await request.json());
	const command = parseCommand(payload.text);

	await recordGatewayEvent({
		provider: payload.provider,
		eventType: "message",
		action: command.action,
		payload: {
			channelId: payload.channelId,
			senderId: payload.senderId,
			eventType: payload.eventType ?? null,
		},
	});

	if (command.action === "link") {
		const client = await db.query.clients.findFirst({
			where: eq(clients.id, command.clientId),
		});
		if (!client) {
			return Response.json(
				{
					ok: false,
					error: "client_not_found",
					replyText:
						"Client not found. Ask an admin for the correct client id.",
				},
				{ status: 404 },
			);
		}

		await db
			.insert(channelIdentities)
			.values({
				id: `chan_${crypto.randomUUID()}`,
				teamDbId: client.teamDbId,
				clientDbId: client.dbId,
				provider: payload.provider,
				providerUserId: payload.senderId,
				providerChannelId: payload.channelId,
			})
			.onConflictDoNothing();

		return Response.json({
			ok: true,
			action: "linked",
			clientId: client.id,
			replyText:
				`Linked to client ${client.name}. ` +
				"Send `brief: ...`, `revision: ...`, or `status`.",
		});
	}

	if (command.action === "help") {
		return Response.json({
			ok: true,
			action: "help",
			replyText: helpText,
			replyBlocks: helpBlocks,
		});
	}

	const identity = await db.query.channelIdentities.findFirst({
		where: and(
			eq(channelIdentities.provider, payload.provider),
			eq(channelIdentities.providerUserId, payload.senderId),
		),
	});

	if (!identity) {
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "error",
			action: "identity_not_linked",
		});
		return Response.json(
			{
				ok: false,
				error: "identity_not_linked",
				replyText: "Please link your account first: `link client:<clientId>`.",
				replyBlocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text:
								"You're not linked yet. Ask an admin for your client id, then run:\n" +
								"`link client:<clientId>`",
						},
					},
					{
						type: "context",
						elements: [
							{
								type: "mrkdwn",
								text: "In channels, mention the bot (e.g. `@Recoder help`) or DM directly.",
							},
						],
					},
				],
			},
			{ status: 404 },
		);
	}

	const client = await db.query.clients.findFirst({
		where: eq(clients.dbId, identity.clientDbId),
	});
	if (!client) {
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "error",
			action: "client_not_found",
			clientDbId: identity.clientDbId,
		});
		return Response.json(
			{
				ok: false,
				error: "client_not_found",
				replyText: "Client not found. Ask an admin for the correct client id.",
			},
			{ status: 404 },
		);
	}

	if (command.action === "brief") {
		if (!command.body) {
			return Response.json(
				{
					ok: false,
					error: "brief_missing_body",
					replyText: "Please include brief details after `brief:`.",
					replyBlocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text:
									"Please include brief details after `brief:`\n" +
									"Example: `brief: landing page for Product X, due next Friday`",
							},
						},
					],
				},
				{ status: 400 },
			);
		}

		const projectId = `proj_${crypto.randomUUID()}`;
		const [inserted] = await db
			.insert(projects)
			.values({
				id: projectId,
				teamDbId: client.teamDbId,
				clientDbId: client.dbId,
				name: `Slack Brief - ${client.name}`,
				brief: command.body,
				status: "queued",
			})
			.returning({ dbId: projects.dbId });

		const projectLink = buildProjectLink(projectId);
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "brief_created",
			action: "brief",
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId,
		});

		// Trigger async quote generation
		triggerAsyncQuoteGeneration({
			projectDbId: inserted.dbId,
			projectId,
			brief: command.body,
			clientName: client.name,
			clientDbId: client.dbId,
			teamDbId: client.teamDbId,
		});

		const projectLinkMrkdwn = formatProjectLink(projectId);
		return Response.json({
			ok: true,
			action: "brief_created",
			projectId,
			replyText: projectLink
				? `Brief received. Project ${projectId} created: ${projectLink}. Generating quote...`
				: `Brief received. Project ${projectId} created. Generating quote...`,
			replyBlocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Brief received. Project created: *${projectId}*. Generating quote...`,
					},
				},
				...(projectLinkMrkdwn
					? [
							{
								type: "section",
								text: { type: "mrkdwn", text: projectLinkMrkdwn },
							},
						]
					: []),
			],
		});
	}

	if (command.action === "list_projects") {
		const page = parseListProjectsPage(payload.text);
		const limit = 5;
		const offset = (page - 1) * limit;
		const projectList = await db.query.projects.findMany({
			where: eq(projects.clientDbId, client.dbId),
			orderBy: desc(projects.createdAt),
			limit,
			offset,
		});

		if (projectList.length === 0) {
			return Response.json({
				ok: true,
				action: "list_projects",
				replyText:
					page > 1
						? "No more projects. Try `list projects` for the first page."
						: "No projects yet. Send `brief: <text>` to create one.",
			});
		}

		const formatted = projectList
			.map((project) => {
				const link = buildProjectLink(project.id);
				return link
					? `• ${project.name} (${project.id}) — ${project.status}\n  ${link}`
					: `• ${project.name} (${project.id}) — ${project.status}`;
			})
			.join("\n");

		const blocks = [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `*Latest projects (page ${page})*`,
				},
			},
			...projectList.map((project) => ({
				type: "section",
				text: {
					type: "mrkdwn",
					text:
						`*${project.name}* (${project.id}) — ${project.status}\n` +
						(formatProjectLink(project.id) ?? ""),
				},
			})),
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: "Use `list projects page 2` for more.",
					},
				],
			},
		];

		return Response.json({
			ok: true,
			action: "list_projects",
			replyText: `Latest projects:\n${formatted}`,
			replyBlocks: blocks,
		});
	}

	const resolveProject = async () => {
		const explicitId = parseProjectId(payload.text);
		if (explicitId) {
			return db.query.projects.findFirst({
				where: and(
					eq(projects.id, explicitId),
					eq(projects.clientDbId, client.dbId),
				),
			});
		}
		return db.query.projects.findFirst({
			where: eq(projects.clientDbId, client.dbId),
			orderBy: desc(projects.createdAt),
		});
	};

	if (command.action === "approve_deliverable") {
		const deliverable = await db.query.deliverables.findFirst({
			where: eq(deliverables.id, command.deliverableId),
		});
		if (!deliverable) {
			return Response.json(
				{
					ok: false,
					error: "deliverable_not_found",
					replyText: "Deliverable not found.",
				},
				{ status: 404 },
			);
		}

		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, deliverable.projectDbId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}

		if (deliverable.status !== "pending_review") {
			return Response.json({
				ok: false,
				error: "deliverable_not_pending",
				replyText: "Only deliverables in pending review can be approved.",
			});
		}

		await db
			.update(deliverables)
			.set({ status: "approved", clientFeedback: null })
			.where(eq(deliverables.dbId, deliverable.dbId));

		const projectDeliverables = await db
			.select({ status: deliverables.status })
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.dbId));

		const hasPendingReview = projectDeliverables.some(
			(d) => d.status === "pending_review",
		);
		const hasRejected = projectDeliverables.some(
			(d) => d.status === "rejected",
		);

		let currentStatus: ProjectStatus = normalizeProjectStatus(project.status);
		if (currentStatus === "qa") {
			currentStatus = await transitionProjectStatusIfValid({
				projectDbId: project.dbId,
				currentStatus,
				nextStatus: "client_review",
				reason: "Client started review",
				deliverableId: deliverable.id,
			});
		}

		const nextStatus: ProjectStatus = hasPendingReview
			? "client_review"
			: hasRejected
				? "in_progress"
				: "done";

		await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus,
			nextStatus,
			reason: "Client approved deliverable",
			deliverableId: deliverable.id,
		});

		const projectLink = buildProjectLink(project.id);
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "deliverable_approved",
			action: "approve_deliverable",
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { deliverableId: deliverable.id },
		});
		const projectLinkMrkdwn = formatProjectLink(project.id);
		return Response.json({
			ok: true,
			action: "deliverable_approved",
			replyText: projectLink
				? `Deliverable ${deliverable.id} approved for ${project.name}. ${projectLink}`
				: `Deliverable ${deliverable.id} approved for ${project.name}.`,
			replyBlocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Deliverable *${deliverable.name}* (${deliverable.id}) approved.`,
					},
				},
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `Project: *${project.name}* (${project.id})`,
						},
					],
				},
				...(projectLinkMrkdwn
					? [
							{
								type: "section",
								text: { type: "mrkdwn", text: projectLinkMrkdwn },
							},
						]
					: []),
			],
		});
	}

	if (command.action === "reject_deliverable") {
		const reason = command.reason?.trim() ?? "";
		if (!reason) {
			return Response.json({
				ok: false,
				error: "reject_reason_required",
				replyText: "Please include a rejection reason.",
				replyBlocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text:
								"Please include a rejection reason.\n" +
								"Example: `reject deliverable:del_123 reason: needs stronger CTA`",
						},
					},
				],
			});
		}

		const deliverable = await db.query.deliverables.findFirst({
			where: eq(deliverables.id, command.deliverableId),
		});
		if (!deliverable) {
			return Response.json(
				{
					ok: false,
					error: "deliverable_not_found",
					replyText: "Deliverable not found.",
				},
				{ status: 404 },
			);
		}

		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, deliverable.projectDbId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}

		if (deliverable.status !== "pending_review") {
			return Response.json({
				ok: false,
				error: "deliverable_not_pending",
				replyText: "Only deliverables in pending review can be rejected.",
			});
		}

		await db
			.update(deliverables)
			.set({ status: "rejected", clientFeedback: reason })
			.where(eq(deliverables.dbId, deliverable.dbId));

		await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus: project.status,
			nextStatus: "in_progress",
			reason: `Client requested revisions: ${reason}`,
			deliverableId: deliverable.id,
		});

		const projectLink = buildProjectLink(project.id);
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "deliverable_rejected",
			action: "reject_deliverable",
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { deliverableId: deliverable.id, reason },
		});
		const projectLinkMrkdwn = formatProjectLink(project.id);
		return Response.json({
			ok: true,
			action: "deliverable_rejected",
			replyText: projectLink
				? `Deliverable ${deliverable.id} rejected for ${project.name}. We'll follow up. ${projectLink}`
				: `Deliverable ${deliverable.id} rejected for ${project.name}. We'll follow up.`,
			replyBlocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Deliverable *${deliverable.name}* (${deliverable.id}) rejected.`,
					},
				},
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `Project: *${project.name}* (${project.id})`,
						},
					],
				},
				...(projectLinkMrkdwn
					? [
							{
								type: "section",
								text: { type: "mrkdwn", text: projectLinkMrkdwn },
							},
						]
					: []),
			],
		});
	}

	if (command.action === "approve_milestone") {
		const milestoneLabel = command.milestoneLabel;
		if (!milestoneLabel) {
			return Response.json({
				ok: false,
				error: "milestone_label_required",
				replyText: "Please provide a milestone label.",
			});
		}
		const project = await resolveProject();
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText:
						"No project found. Try `status` or include `project:<id>`.",
				},
				{ status: 404 },
			);
		}

		const milestoneDeliverables = await db
			.select({ dbId: deliverables.dbId, id: deliverables.id })
			.from(deliverables)
			.where(
				and(
					eq(deliverables.projectDbId, project.dbId),
					eq(deliverables.milestoneLabel, milestoneLabel),
					eq(deliverables.milestoneApprovalStatus, "pending_approval"),
				),
			);

		if (milestoneDeliverables.length === 0) {
			return Response.json({
				ok: false,
				error: "milestone_not_pending",
				replyText: "No pending milestone approvals found.",
			});
		}

		const milestoneApprovalId = `ma_${crypto
			.randomUUID()
			.replace(/-/g, "")
			.slice(0, 16)}`;

		await db.transaction(async (tx) => {
			for (const d of milestoneDeliverables) {
				await tx
					.update(deliverables)
					.set({
						status: "approved",
						milestoneApprovalStatus: "approved",
						clientFeedback: null,
					})
					.where(eq(deliverables.dbId, d.dbId));
			}

			await tx
				.insert(milestoneApprovals)
				.values({
					id: milestoneApprovalId,
					projectDbId: project.dbId,
					milestoneLabel,
					status: "approved",
					decidedByUserDbId: null,
					decidedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [
						milestoneApprovals.projectDbId,
						milestoneApprovals.milestoneLabel,
					],
					set: {
						status: "approved",
						decidedByUserDbId: null,
						decidedAt: new Date(),
						decisionReason: null,
					},
				});
		});

		const remaining = await db
			.select({ status: deliverables.status })
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.dbId));

		const hasPendingReview = remaining.some(
			(d) => d.status === "pending_review",
		);
		const hasRejected = remaining.some((d) => d.status === "rejected");
		const nextStatus: ProjectStatus = hasPendingReview
			? "client_review"
			: hasRejected
				? "in_progress"
				: "done";

		await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus: project.status,
			nextStatus,
			reason: `Client approved milestone: ${milestoneLabel}`,
			bulk: true,
		});

		const projectLink = buildProjectLink(project.id);
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "milestone_approved",
			action: "approve_milestone",
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { milestoneLabel },
		});
		const projectLinkMrkdwn = formatProjectLink(project.id);
		return Response.json({
			ok: true,
			action: "milestone_approved",
			replyText: projectLink
				? `Milestone "${milestoneLabel}" approved for ${project.name}. ${projectLink}`
				: `Milestone "${milestoneLabel}" approved for ${project.name}.`,
			replyBlocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Milestone *${milestoneLabel}* approved.`,
					},
				},
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `Project: *${project.name}* (${project.id})`,
						},
					],
				},
				...(projectLinkMrkdwn
					? [
							{
								type: "section",
								text: { type: "mrkdwn", text: projectLinkMrkdwn },
							},
						]
					: []),
			],
		});
	}

	if (command.action === "reject_milestone") {
		const milestoneLabel = command.milestoneLabel;
		const reason = command.reason?.trim() ?? "";
		if (!milestoneLabel || !reason) {
			return Response.json({
				ok: false,
				error: "milestone_reject_missing",
				replyText: "Please provide a milestone label and rejection reason.",
				replyBlocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text:
								"Please provide a milestone label and rejection reason.\n" +
								"Example: `reject milestone: Phase 1 reason: missing mobile layout`",
						},
					},
				],
			});
		}
		const project = await resolveProject();
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText:
						"No project found. Try `status` or include `project:<id>`.",
				},
				{ status: 404 },
			);
		}

		const milestoneDeliverables = await db
			.select({ dbId: deliverables.dbId, id: deliverables.id })
			.from(deliverables)
			.where(
				and(
					eq(deliverables.projectDbId, project.dbId),
					eq(deliverables.milestoneLabel, milestoneLabel),
					eq(deliverables.milestoneApprovalStatus, "pending_approval"),
				),
			);

		if (milestoneDeliverables.length === 0) {
			return Response.json({
				ok: false,
				error: "milestone_not_pending",
				replyText: "No pending milestone approvals found.",
			});
		}

		const milestoneApprovalId = `ma_${crypto
			.randomUUID()
			.replace(/-/g, "")
			.slice(0, 16)}`;

		await db.transaction(async (tx) => {
			for (const d of milestoneDeliverables) {
				await tx
					.update(deliverables)
					.set({
						status: "rejected",
						milestoneApprovalStatus: "rejected",
						clientFeedback: reason,
					})
					.where(eq(deliverables.dbId, d.dbId));
			}

			await tx
				.insert(milestoneApprovals)
				.values({
					id: milestoneApprovalId,
					projectDbId: project.dbId,
					milestoneLabel,
					status: "rejected",
					decidedByUserDbId: null,
					decisionReason: reason,
					decidedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [
						milestoneApprovals.projectDbId,
						milestoneApprovals.milestoneLabel,
					],
					set: {
						status: "rejected",
						decidedByUserDbId: null,
						decisionReason: reason,
						decidedAt: new Date(),
					},
				});
		});

		await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus: project.status,
			nextStatus: "in_progress",
			reason: `Client rejected milestone "${milestoneLabel}": ${reason}`,
			bulk: true,
		});

		const projectLink = buildProjectLink(project.id);
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "milestone_rejected",
			action: "reject_milestone",
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { milestoneLabel, reason },
		});
		const projectLinkMrkdwn = formatProjectLink(project.id);
		return Response.json({
			ok: true,
			action: "milestone_rejected",
			replyText: projectLink
				? `Milestone "${milestoneLabel}" rejected for ${project.name}. We'll follow up. ${projectLink}`
				: `Milestone "${milestoneLabel}" rejected for ${project.name}. We'll follow up.`,
			replyBlocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Milestone *${milestoneLabel}* rejected.`,
					},
				},
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `Project: *${project.name}* (${project.id})`,
						},
					],
				},
				...(projectLinkMrkdwn
					? [
							{
								type: "section",
								text: { type: "mrkdwn", text: projectLinkMrkdwn },
							},
						]
					: []),
			],
		});
	}

	if (command.action === "approve_change_order") {
		const changeOrder = await db.query.changeOrders.findFirst({
			where: eq(changeOrders.id, command.changeOrderId),
		});
		if (!changeOrder) {
			return Response.json(
				{
					ok: false,
					error: "change_order_not_found",
					replyText: "Change order not found.",
				},
				{ status: 404 },
			);
		}

		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, changeOrder.projectDbId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}

		if (changeOrder.status !== "pending") {
			return Response.json({
				ok: false,
				error: "change_order_not_pending",
				replyText: "Only pending change orders can be approved.",
			});
		}

		await db.transaction(async (tx) => {
			await tx
				.update(changeOrders)
				.set({
					status: "approved",
					approvedAt: new Date(),
					rejectedAt: null,
					decidedByUserDbId: null,
					decisionReason: "Approved by client",
				})
				.where(eq(changeOrders.dbId, changeOrder.dbId));

			const nextBudget =
				(project.budgetCents ?? 0) + (changeOrder.billingDeltaCents ?? 0);
			const appendedScope = `${project.scopeOverrideReason ? `${project.scopeOverrideReason}\n` : ""}[v${changeOrder.scopeVersion}] ${changeOrder.scopeDelta}`;
			await tx
				.update(projects)
				.set({
					budgetCents: nextBudget,
					scopeOverrideReason: appendedScope,
				})
				.where(eq(projects.dbId, project.dbId));

			if (changeOrder.quoteDbId != null) {
				const linkedQuote = await tx.query.quotes.findFirst({
					where: eq(quotes.dbId, changeOrder.quoteDbId),
				});
				if (linkedQuote) {
					await tx
						.update(quotes)
						.set({
							priceCents:
								linkedQuote.priceCents + (changeOrder.billingDeltaCents ?? 0),
						})
						.where(eq(quotes.dbId, linkedQuote.dbId));
				}
			}
		});

		const projectLink = buildProjectLink(project.id);
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "change_order_approved",
			action: "approve_change_order",
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { changeOrderId: changeOrder.id },
		});
		const projectLinkMrkdwn = formatProjectLink(project.id);
		return Response.json({
			ok: true,
			action: "change_order_approved",
			replyText: projectLink
				? `Change order ${changeOrder.id} approved for ${project.name}. ${projectLink}`
				: `Change order ${changeOrder.id} approved for ${project.name}.`,
			replyBlocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Change order *${changeOrder.id}* approved.`,
					},
				},
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `Project: *${project.name}* (${project.id})`,
						},
					],
				},
				...(projectLinkMrkdwn
					? [
							{
								type: "section",
								text: { type: "mrkdwn", text: projectLinkMrkdwn },
							},
						]
					: []),
			],
		});
	}

	if (command.action === "reject_change_order") {
		const reason = command.reason?.trim() ?? "";
		if (!reason) {
			return Response.json({
				ok: false,
				error: "reject_reason_required",
				replyText: "Please include a rejection reason.",
				replyBlocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text:
								"Please include a rejection reason.\n" +
								"Example: `reject change order:co_123 reason: out of scope`",
						},
					},
				],
			});
		}

		const changeOrder = await db.query.changeOrders.findFirst({
			where: eq(changeOrders.id, command.changeOrderId),
		});
		if (!changeOrder) {
			return Response.json(
				{
					ok: false,
					error: "change_order_not_found",
					replyText: "Change order not found.",
				},
				{ status: 404 },
			);
		}

		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, changeOrder.projectDbId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}

		if (changeOrder.status !== "pending") {
			return Response.json({
				ok: false,
				error: "change_order_not_pending",
				replyText: "Only pending change orders can be rejected.",
			});
		}

		await db
			.update(changeOrders)
			.set({
				status: "rejected",
				rejectedAt: new Date(),
				decidedByUserDbId: null,
				decisionReason: reason,
			})
			.where(eq(changeOrders.dbId, changeOrder.dbId));

		const projectLink = buildProjectLink(project.id);
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "change_order_rejected",
			action: "reject_change_order",
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { changeOrderId: changeOrder.id, reason },
		});
		const projectLinkMrkdwn = formatProjectLink(project.id);
		return Response.json({
			ok: true,
			action: "change_order_rejected",
			replyText: projectLink
				? `Change order ${changeOrder.id} rejected for ${project.name}. ${projectLink}`
				: `Change order ${changeOrder.id} rejected for ${project.name}.`,
			replyBlocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Change order *${changeOrder.id}* rejected.`,
					},
				},
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `Project: *${project.name}* (${project.id})`,
						},
					],
				},
				...(projectLinkMrkdwn
					? [
							{
								type: "section",
								text: { type: "mrkdwn", text: projectLinkMrkdwn },
							},
						]
					: []),
			],
		});
	}

	if (command.action === "revision") {
		if (!command.body) {
			return Response.json(
				{
					ok: false,
					error: "revision_missing_body",
					replyText: "Please include revision details after `revision:`.",
					replyBlocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text:
									"Please include revision details after `revision:`\n" +
									"Example: `revision: update hero copy to focus on ROI`",
							},
						},
					],
				},
				{ status: 400 },
			);
		}

		const project = await resolveProject();
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText:
						"No project found. Try `status` or include `project:<id>`.",
					replyBlocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: "No project found. Try `status` or include `project:<id>`.",
							},
						},
					],
				},
				{ status: 404 },
			);
		}

		const latest = await db.query.changeOrders.findFirst({
			where: eq(changeOrders.projectDbId, project.dbId),
			orderBy: desc(changeOrders.scopeVersion),
		});
		const nextVersion = (latest?.scopeVersion ?? 0) + 1;

		let quoteDbId: number | null = project.quoteDbId ?? null;
		if (quoteDbId == null) {
			const linkedQuote = await db.query.quotes.findFirst({
				where: eq(quotes.projectDbId, project.dbId),
			});
			quoteDbId = linkedQuote?.dbId ?? null;
		}

		const changeOrderId = `co_${crypto.randomUUID()}`;
		await db.insert(changeOrders).values({
			id: changeOrderId,
			teamDbId: client.teamDbId,
			projectDbId: project.dbId,
			clientDbId: client.dbId,
			quoteDbId,
			title: "Client revision request",
			scopeDelta: command.body,
			billingDeltaCents: 0,
			scopeVersion: nextVersion,
			status: "pending",
			requestedByUserDbId: null,
		});

		const projectLink = buildProjectLink(project.id);
		const projectLinkMrkdwn = formatProjectLink(project.id);
		return Response.json({
			ok: true,
			action: "revision_created",
			projectId: project.id,
			changeOrderId,
			replyText:
				`Revision request received for project ${project.id}. ` +
				"We'll review and follow up.",
			replyBlocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Revision request received for *${project.name}* (${project.id}).`,
					},
				},
				...(projectLinkMrkdwn
					? [
							{
								type: "section",
								text: { type: "mrkdwn", text: projectLinkMrkdwn },
							},
						]
					: []),
			],
		});
	}

	if (command.action === "status") {
		const project = await resolveProject();
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText:
						"No project found. Try `status` or include `project:<id>`.",
					replyBlocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: "No project found. Try `status` or include `project:<id>`.",
							},
						},
					],
				},
				{ status: 404 },
			);
		}

		const pendingDeliverables = await db
			.select({
				id: deliverables.id,
				name: deliverables.name,
				dbId: deliverables.dbId,
			})
			.from(deliverables)
			.where(
				and(
					eq(deliverables.projectDbId, project.dbId),
					eq(deliverables.status, "pending_review"),
				),
			)
			.limit(5);

		const pendingMilestones = await db
			.select({ label: deliverables.milestoneLabel })
			.from(deliverables)
			.where(
				and(
					eq(deliverables.projectDbId, project.dbId),
					eq(deliverables.milestoneApprovalStatus, "pending_approval"),
				),
			)
			.limit(5);

		const pendingChangeOrders = await db
			.select({ id: changeOrders.id })
			.from(changeOrders)
			.where(
				and(
					eq(changeOrders.projectDbId, project.dbId),
					eq(changeOrders.status, "pending"),
				),
			)
			.limit(5);

		const projectLink = buildProjectLink(project.id);
		const projectLinkMrkdwn = formatProjectLink(project.id);

		const actionBlocks: Array<Record<string, unknown>> = [];

		if (pendingDeliverables.length > 0) {
			actionBlocks.push({
				type: "section",
				text: { type: "mrkdwn", text: "*Pending deliverables*" },
			});
			for (const deliverable of pendingDeliverables) {
				const approveButton = buildActionButton({
					text: "Approve",
					actionId: "approve_deliverable",
					style: "primary",
					value: {
						action: "approve_deliverable",
						deliverableId: deliverable.id,
						projectId: project.id,
						clientDbId: client.dbId,
						expiresAt: Date.now() + 1000 * 60 * 60,
					},
				});
				const rejectButton = buildActionButton({
					text: "Reject",
					actionId: "reject_deliverable_modal",
					style: "danger",
					value: {
						action: "reject_deliverable",
						deliverableId: deliverable.id,
						projectId: project.id,
						clientDbId: client.dbId,
						expiresAt: Date.now() + 1000 * 60 * 60,
					},
				});
				actionBlocks.push({
					type: "section",
					text: {
						type: "mrkdwn",
						text: `• *${deliverable.name}* (${deliverable.id})`,
					},
				});
				actionBlocks.push({
					type: "actions",
					elements: [approveButton, rejectButton].filter(Boolean),
				});
			}
		}

		if (pendingMilestones.length > 0) {
			actionBlocks.push({
				type: "section",
				text: { type: "mrkdwn", text: "*Pending milestones*" },
			});
			for (const milestone of pendingMilestones) {
				if (!milestone.label) continue;
				const approveButton = buildActionButton({
					text: "Approve",
					actionId: "approve_milestone",
					style: "primary",
					value: {
						action: "approve_milestone",
						milestoneLabel: milestone.label,
						projectId: project.id,
						clientDbId: client.dbId,
						expiresAt: Date.now() + 1000 * 60 * 60,
					},
				});
				const rejectButton = buildActionButton({
					text: "Reject",
					actionId: "reject_milestone_modal",
					style: "danger",
					value: {
						action: "reject_milestone",
						milestoneLabel: milestone.label,
						projectId: project.id,
						clientDbId: client.dbId,
						expiresAt: Date.now() + 1000 * 60 * 60,
					},
				});
				actionBlocks.push({
					type: "section",
					text: { type: "mrkdwn", text: `• *${milestone.label}*` },
				});
				actionBlocks.push({
					type: "actions",
					elements: [approveButton, rejectButton].filter(Boolean),
				});
			}
		}

		if (pendingChangeOrders.length > 0) {
			actionBlocks.push({
				type: "section",
				text: { type: "mrkdwn", text: "*Pending change orders*" },
			});
			for (const changeOrder of pendingChangeOrders) {
				const approveButton = buildActionButton({
					text: "Approve",
					actionId: "approve_change_order",
					style: "primary",
					value: {
						action: "approve_change_order",
						changeOrderId: changeOrder.id,
						projectId: project.id,
						clientDbId: client.dbId,
						expiresAt: Date.now() + 1000 * 60 * 60,
					},
				});
				const rejectButton = buildActionButton({
					text: "Reject",
					actionId: "reject_change_order_modal",
					style: "danger",
					value: {
						action: "reject_change_order",
						changeOrderId: changeOrder.id,
						projectId: project.id,
						clientDbId: client.dbId,
						expiresAt: Date.now() + 1000 * 60 * 60,
					},
				});
				actionBlocks.push({
					type: "section",
					text: { type: "mrkdwn", text: `• *${changeOrder.id}*` },
				});
				actionBlocks.push({
					type: "actions",
					elements: [approveButton, rejectButton].filter(Boolean),
				});
			}
		}

		return Response.json({
			ok: true,
			action: "status",
			project: {
				id: project.id,
				name: project.name,
				status: project.status,
			},
			replyText: projectLink
				? `Project ${project.name} (${project.id}) is ${project.status}. ${projectLink}`
				: `Project ${project.name} (${project.id}) is ${project.status}.`,
			replyBlocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*${project.name}* (${project.id}) is *${project.status}*`,
					},
				},
				...(projectLinkMrkdwn
					? [
							{
								type: "section",
								text: { type: "mrkdwn", text: projectLinkMrkdwn },
							},
						]
					: []),
				...actionBlocks,
			],
		});
	}

	// ── Intent detection fallback for natural language messages ──
	if (command.action === "ignore") {
		try {
			const { conversationDbId, messages: history } =
				await loadConversationHistory({
					clientDbId: client.dbId,
					provider: payload.provider as ChannelProvider,
					channelId: payload.channelId,
					threadId: payload.threadId,
				});

			// Record user message in conversation
			await appendMessage({
				conversationDbId,
				role: "user",
				content: payload.text,
				providerMessageId: payload.messageId,
			});

			// Gather client context for intent detection
			const activeProjectList = await db.query.projects.findMany({
				where: eq(projects.clientDbId, client.dbId),
				orderBy: desc(projects.createdAt),
				limit: 5,
			});

			const pendingDeliverableList = await db
				.select({ id: deliverables.id, name: deliverables.name })
				.from(deliverables)
				.innerJoin(projects, eq(projects.dbId, deliverables.projectDbId))
				.where(
					and(
						eq(projects.clientDbId, client.dbId),
						eq(deliverables.status, "pending_review"),
					),
				)
				.limit(5);

			const pendingQuoteCount = await db
				.select({ id: quotes.id })
				.from(quotes)
				.innerJoin(projects, eq(projects.dbId, quotes.projectDbId))
				.where(
					and(eq(projects.clientDbId, client.dbId), eq(quotes.status, "sent")),
				)
				.limit(5);

			// Use OpenRouter-compatible model for intent detection if available
			let intent: DetectedIntent = { type: "unknown" };
			try {
				const { createOpenRouterModel } = await import(
					"@/lib/agency/openrouter-model"
				);
				const model = await createOpenRouterModel("openai/gpt-4o-mini");
				if (model) {
					intent = await detectIntent({
						message: payload.text,
						conversationHistory: history,
						clientContext: {
							activeProjects: activeProjectList.map((p) => ({
								id: p.id,
								name: p.name,
								status: p.status,
							})),
							pendingDeliverables: pendingDeliverableList,
							pendingQuotes: pendingQuoteCount.length,
						},
						model,
					});
				}
			} catch {
				// No AI model available; fall through to unknown
			}

			// Execute the intent via the agent orchestrator
			const workflowId = `conv_${conversationDbId}`;
			const taskId = `msg_${payload.messageId}`;
			const ambDispatcher = isAmbDispatchEnabled()
				? getAMBDispatcher()
				: null;
			if (ambDispatcher) {
				void ambDispatcher.onWorkflowStart(
					workflowId,
					"agency-gateway",
					`Intent ${intent.type} from ${payload.provider}`,
				);
				void ambDispatcher.onTaskAssigned(
					workflowId,
					taskId,
					"agency-orchestrator",
					intent.type,
				);
			}

			let orchestratorResult: {
				action: string;
				replyText: string;
				projectId?: string;
				metadata?: Record<string, unknown>;
			};
			let orchestratorFailed = false;
			try {
				const { requireOpenRouterModel } = await import(
					"@/lib/agency/openrouter-model"
				);
				orchestratorResult = await executeIntent({
					intent,
					clientDbId: client.dbId,
					teamDbId: client.teamDbId,
					provider: payload.provider as ChannelProvider,
					conversationHistory: history,
					model: await requireOpenRouterModel("openai/gpt-4o-mini"),
				});
				if (ambDispatcher) {
					void ambDispatcher.onTaskCompleted(
						workflowId,
						taskId,
						"agency-orchestrator",
						orchestratorResult.action,
					);
				}
			} catch (orchError) {
				console.error("Orchestrator execution failed:", orchError);
				orchestratorFailed = true;
				orchestratorResult = {
					action: "orchestrator_error",
					replyText:
						"Something went wrong processing your request. Please try again or use `help` for commands.",
				};
				if (ambDispatcher) {
					void ambDispatcher.onTaskFailed(
						workflowId,
						taskId,
						"agency-orchestrator",
						orchError instanceof Error ? orchError.message : String(orchError),
					);
				}
			}

			const replyText = orchestratorResult.replyText;

			// Record assistant reply
			await appendMessage({
				conversationDbId,
				role: "assistant",
				content: replyText,
			});

			await recordGatewayEvent({
				provider: payload.provider as ChannelProvider,
				eventType: "intent_executed",
				action: orchestratorResult.action,
				teamDbId: client.teamDbId,
				clientDbId: client.dbId,
				projectId: orchestratorResult.projectId ?? null,
				payload: { intent: intent.type, ...orchestratorResult.metadata },
			});

			if (ambDispatcher) {
				void ambDispatcher.onWorkflowCompleted(
					workflowId,
					orchestratorFailed
						? "Workflow finished with orchestrator error"
						: `Workflow completed with action ${orchestratorResult.action}`,
				);
			}

			return Response.json({
				ok: true,
				action: orchestratorResult.action,
				intent: intent.type,
				replyText,
				projectId: orchestratorResult.projectId,
			});
		} catch (error) {
			console.error("Intent detection error:", error);
		}
	}

	return Response.json({ ok: true, action: "ignored" });
}

/**
 * Fire-and-forget quote generation after a brief is created.
 * Uses dynamic import to avoid loading AI SDK for non-brief requests.
 */
function triggerAsyncQuoteGeneration(params: {
	projectDbId: number;
	projectId: string;
	brief: string;
	clientName: string;
	clientDbId: number;
	teamDbId: number;
}): void {
	(async () => {
		try {
			const { createOpenRouterModel } = await import(
				"@/lib/agency/openrouter-model"
			);
			const model = await createOpenRouterModel("openai/gpt-4o-mini");
			if (!model) {
				console.warn("Skipping quote generation: OPENROUTER_API_KEY not set");
				return;
			}
			const { generateQuoteFromBrief } = await import(
				"@/lib/agency/workflows/quote-generator"
			);
			await generateQuoteFromBrief({
				...params,
				model,
			});
		} catch (error) {
			console.error("Async quote generation failed:", error);
		}
	})();
}
