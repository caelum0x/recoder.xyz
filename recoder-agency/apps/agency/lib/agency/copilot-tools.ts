import { and, eq } from "drizzle-orm";
import {
	type ClientStatus,
	type DeliverableType,
	type ProjectStatus,
	clients,
	db,
	deliverables,
	projects,
	quotes,
} from "@/db";

// ── OpenAI function-calling tool definitions ────────────────────

export const copilotToolDefinitions = [
	{
		type: "function" as const,
		function: {
			name: "listClients",
			description:
				"List all clients for the current team. Use when the user asks about clients or needs to pick a client.",
			parameters: {
				type: "object",
				properties: {},
				required: [],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "createClient",
			description:
				"Create a new client record. Use when the user wants to add a new client.",
			parameters: {
				type: "object",
				properties: {
					name: {
						type: "string",
						description: "Client name (required)",
					},
					email: {
						type: "string",
						description: "Client email address",
					},
					company: {
						type: "string",
						description: "Company name",
					},
					phone: {
						type: "string",
						description: "Phone number",
					},
				},
				required: ["name"],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "updateClient",
			description:
				"Update an existing client's details. Use when the user wants to change client info.",
			parameters: {
				type: "object",
				properties: {
					clientId: {
						type: "string",
						description: "The client's unique ID",
					},
					name: { type: "string", description: "New name" },
					email: { type: "string", description: "New email" },
					company: { type: "string", description: "New company" },
					phone: { type: "string", description: "New phone" },
					status: {
						type: "string",
						enum: ["active", "inactive", "lead"],
						description: "New status",
					},
				},
				required: ["clientId"],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "listProjects",
			description:
				"List projects, optionally filtered by client ID. Use to see all projects or a specific client's projects.",
			parameters: {
				type: "object",
				properties: {
					clientId: {
						type: "string",
						description:
							"Optional client ID to filter projects by client",
					},
				},
				required: [],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "createProject",
			description:
				"Create a new project for a client. Use when the user wants to start a new project.",
			parameters: {
				type: "object",
				properties: {
					clientId: {
						type: "string",
						description: "The client's unique ID (required)",
					},
					name: {
						type: "string",
						description: "Project name (required)",
					},
					brief: {
						type: "string",
						description: "Project brief / description",
					},
				},
				required: ["clientId", "name"],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "updateProjectStatus",
			description:
				"Update a project's status. Use when the user wants to change a project's workflow status.",
			parameters: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The project's unique ID",
					},
					newStatus: {
						type: "string",
						enum: [
							"queued",
							"in_progress",
							"qa",
							"client_review",
							"done",
							"blocked",
						],
						description: "The new status",
					},
				},
				required: ["projectId", "newStatus"],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "createDeliverable",
			description:
				"Create a new deliverable within a project. Use when the user wants to add a deliverable.",
			parameters: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The project's unique ID (required)",
					},
					name: {
						type: "string",
						description: "Deliverable name (required)",
					},
					type: {
						type: "string",
						enum: ["document", "code", "design", "other"],
						description: "Deliverable type (defaults to document)",
					},
					content: {
						type: "string",
						description: "Initial content for the deliverable",
					},
				},
				required: ["projectId", "name"],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "createQuote",
			description:
				"Create a price quote for a client. Use when the user wants to create a quote or estimate.",
			parameters: {
				type: "object",
				properties: {
					clientId: {
						type: "string",
						description: "The client's unique ID (required)",
					},
					title: {
						type: "string",
						description: "Quote title (required)",
					},
					priceCents: {
						type: "number",
						description:
							"Total price in cents, e.g. 50000 = $500.00 (required)",
					},
					scopeSnapshot: {
						type: "string",
						description:
							"Brief scope description for the quote",
					},
					notes: {
						type: "string",
						description: "Additional notes on the quote",
					},
				},
				required: ["clientId", "title", "priceCents"],
			},
		},
	},
];

// ── Tool handler type ───────────────────────────────────────────

type ToolCallArgs = Record<string, unknown>;

type ToolResult = {
	success: boolean;
	data?: unknown;
	error?: string;
};

// ── Tool execution ──────────────────────────────────────────────

export async function executeTool(
	toolName: string,
	args: ToolCallArgs,
	teamDbId: number,
): Promise<ToolResult> {
	try {
		switch (toolName) {
			case "listClients":
				return await handleListClients(teamDbId);
			case "createClient":
				return await handleCreateClient(args, teamDbId);
			case "updateClient":
				return await handleUpdateClient(args, teamDbId);
			case "listProjects":
				return await handleListProjects(args, teamDbId);
			case "createProject":
				return await handleCreateProject(args, teamDbId);
			case "updateProjectStatus":
				return await handleUpdateProjectStatus(args, teamDbId);
			case "createDeliverable":
				return await handleCreateDeliverable(args, teamDbId);
			case "createQuote":
				return await handleCreateQuote(args, teamDbId);
			default:
				return { success: false, error: `Unknown tool: ${toolName}` };
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, error: message };
	}
}

// ── Individual handlers ─────────────────────────────────────────

async function handleListClients(teamDbId: number): Promise<ToolResult> {
	const rows = await db
		.select({
			id: clients.id,
			name: clients.name,
			email: clients.email,
			company: clients.company,
			phone: clients.phone,
			status: clients.status,
		})
		.from(clients)
		.where(eq(clients.teamDbId, teamDbId));

	return { success: true, data: rows };
}

async function handleCreateClient(
	args: ToolCallArgs,
	teamDbId: number,
): Promise<ToolResult> {
	const name = String(args.name ?? "").trim();
	if (!name) {
		return { success: false, error: "Client name is required" };
	}

	const id = crypto.randomUUID();
	await db.insert(clients).values({
		id,
		teamDbId,
		name,
		email: args.email ? String(args.email).trim() : null,
		company: args.company ? String(args.company).trim() : null,
		phone: args.phone ? String(args.phone).trim() : null,
		status: "lead" as ClientStatus,
	});

	return {
		success: true,
		data: { id, name, message: `Client "${name}" created successfully.` },
	};
}

async function handleUpdateClient(
	args: ToolCallArgs,
	teamDbId: number,
): Promise<ToolResult> {
	const clientId = String(args.clientId ?? "").trim();
	if (!clientId) {
		return { success: false, error: "clientId is required" };
	}

	const existing = await db.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.teamDbId, teamDbId)),
	});
	if (!existing) {
		return { success: false, error: "Client not found" };
	}

	const updates: Record<string, unknown> = {};
	if (args.name) updates.name = String(args.name).trim();
	if (args.email !== undefined)
		updates.email = args.email ? String(args.email).trim() : null;
	if (args.company !== undefined)
		updates.company = args.company ? String(args.company).trim() : null;
	if (args.phone !== undefined)
		updates.phone = args.phone ? String(args.phone).trim() : null;
	if (args.status) {
		const s = String(args.status);
		if (!["active", "inactive", "lead"].includes(s)) {
			return {
				success: false,
				error: `Invalid status "${s}". Must be active, inactive, or lead.`,
			};
		}
		updates.status = s as ClientStatus;
	}

	if (Object.keys(updates).length === 0) {
		return { success: false, error: "No fields to update" };
	}

	await db
		.update(clients)
		.set(updates)
		.where(and(eq(clients.id, clientId), eq(clients.teamDbId, teamDbId)));

	return {
		success: true,
		data: {
			id: clientId,
			updated: Object.keys(updates),
			message: `Client updated: ${Object.keys(updates).join(", ")}.`,
		},
	};
}

async function handleListProjects(
	args: ToolCallArgs,
	teamDbId: number,
): Promise<ToolResult> {
	const clientId = args.clientId ? String(args.clientId).trim() : null;

	if (clientId) {
		const client = await db.query.clients.findFirst({
			where: and(eq(clients.id, clientId), eq(clients.teamDbId, teamDbId)),
		});
		if (!client) {
			return { success: false, error: "Client not found" };
		}

		const rows = await db
			.select({
				id: projects.id,
				name: projects.name,
				status: projects.status,
				brief: projects.brief,
				budgetCents: projects.budgetCents,
			})
			.from(projects)
			.where(
				and(
					eq(projects.teamDbId, teamDbId),
					eq(projects.clientDbId, client.dbId),
				),
			);

		return { success: true, data: rows };
	}

	const rows = await db
		.select({
			id: projects.id,
			name: projects.name,
			status: projects.status,
			brief: projects.brief,
			budgetCents: projects.budgetCents,
		})
		.from(projects)
		.where(eq(projects.teamDbId, teamDbId));

	return { success: true, data: rows };
}

async function handleCreateProject(
	args: ToolCallArgs,
	teamDbId: number,
): Promise<ToolResult> {
	const clientId = String(args.clientId ?? "").trim();
	const name = String(args.name ?? "").trim();

	if (!clientId) {
		return { success: false, error: "clientId is required" };
	}
	if (!name) {
		return { success: false, error: "Project name is required" };
	}

	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.teamDbId, teamDbId)),
	});
	if (!client) {
		return { success: false, error: "Client not found" };
	}

	const id = crypto.randomUUID();
	await db.insert(projects).values({
		id,
		teamDbId,
		clientDbId: client.dbId,
		name,
		brief: args.brief ? String(args.brief).trim() : null,
		status: "queued" as ProjectStatus,
	});

	return {
		success: true,
		data: {
			id,
			name,
			clientName: client.name,
			message: `Project "${name}" created for client "${client.name}".`,
		},
	};
}

async function handleUpdateProjectStatus(
	args: ToolCallArgs,
	teamDbId: number,
): Promise<ToolResult> {
	const projectId = String(args.projectId ?? "").trim();
	const newStatus = String(args.newStatus ?? "").trim();

	if (!projectId) {
		return { success: false, error: "projectId is required" };
	}

	const validStatuses = [
		"queued",
		"in_progress",
		"qa",
		"client_review",
		"done",
		"blocked",
	];
	if (!validStatuses.includes(newStatus)) {
		return {
			success: false,
			error: `Invalid status "${newStatus}". Must be one of: ${validStatuses.join(", ")}.`,
		};
	}

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, teamDbId)),
	});
	if (!project) {
		return { success: false, error: "Project not found" };
	}

	const oldStatus = project.status;
	await db
		.update(projects)
		.set({ status: newStatus as ProjectStatus })
		.where(
			and(eq(projects.id, projectId), eq(projects.teamDbId, teamDbId)),
		);

	return {
		success: true,
		data: {
			id: projectId,
			oldStatus,
			newStatus,
			message: `Project "${project.name}" status changed from "${oldStatus}" to "${newStatus}".`,
		},
	};
}

async function handleCreateDeliverable(
	args: ToolCallArgs,
	teamDbId: number,
): Promise<ToolResult> {
	const projectId = String(args.projectId ?? "").trim();
	const name = String(args.name ?? "").trim();

	if (!projectId) {
		return { success: false, error: "projectId is required" };
	}
	if (!name) {
		return { success: false, error: "Deliverable name is required" };
	}

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, teamDbId)),
	});
	if (!project) {
		return { success: false, error: "Project not found" };
	}

	const validTypes = ["document", "code", "design", "other"];
	const type = args.type ? String(args.type).trim() : "document";
	if (!validTypes.includes(type)) {
		return {
			success: false,
			error: `Invalid type "${type}". Must be one of: ${validTypes.join(", ")}.`,
		};
	}

	const id = crypto.randomUUID();
	await db.insert(deliverables).values({
		id,
		projectDbId: project.dbId,
		name,
		type: type as DeliverableType,
		content: args.content ? String(args.content).trim() : null,
		status: "draft",
	});

	return {
		success: true,
		data: {
			id,
			name,
			type,
			projectName: project.name,
			message: `Deliverable "${name}" (${type}) created in project "${project.name}".`,
		},
	};
}

async function handleCreateQuote(
	args: ToolCallArgs,
	teamDbId: number,
): Promise<ToolResult> {
	const clientId = String(args.clientId ?? "").trim();
	const title = String(args.title ?? "").trim();
	const priceCents = Number(args.priceCents);

	if (!clientId) {
		return { success: false, error: "clientId is required" };
	}
	if (!title) {
		return { success: false, error: "Quote title is required" };
	}
	if (!Number.isFinite(priceCents) || priceCents < 0) {
		return {
			success: false,
			error: "priceCents must be a non-negative number",
		};
	}

	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.teamDbId, teamDbId)),
	});
	if (!client) {
		return { success: false, error: "Client not found" };
	}

	const id = crypto.randomUUID();
	await db.insert(quotes).values({
		id,
		teamDbId,
		clientDbId: client.dbId,
		title,
		priceCents: Math.round(priceCents),
		scopeSnapshot: args.scopeSnapshot
			? String(args.scopeSnapshot).trim()
			: title,
		notes: args.notes ? String(args.notes).trim() : null,
		status: "draft",
	});

	return {
		success: true,
		data: {
			id,
			title,
			priceCents: Math.round(priceCents),
			clientName: client.name,
			message: `Quote "${title}" ($${(Math.round(priceCents) / 100).toFixed(2)}) created for client "${client.name}".`,
		},
	};
}
