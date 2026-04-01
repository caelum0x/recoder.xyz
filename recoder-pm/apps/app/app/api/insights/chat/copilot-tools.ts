import { RecoderPmRole } from "@repo/backend/auth";
import { database } from "@repo/backend/database";
import { textToContent } from "@repo/editor/lib/tiptap";
import { log } from "@repo/observability/log";

// ── OpenRouter tool definitions (function-calling schema) ───────────────────

export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "createFeature",
      description:
        "Create a new feature in the user's product management workspace.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the feature" },
          description: {
            type: "string",
            description: "Optional plain-text description for the feature body",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateFeatureStatus",
      description:
        "Change the status of an existing feature (e.g. move to In Progress, Done).",
      parameters: {
        type: "object",
        properties: {
          featureId: { type: "string", description: "ID of the feature" },
          statusName: {
            type: "string",
            description:
              "Name of the target status (e.g. 'In Progress', 'Done')",
          },
        },
        required: ["featureId", "statusName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createFeedback",
      description: "Create a new feedback item in the workspace.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the feedback" },
          content: {
            type: "string",
            description: "Optional plain-text body of the feedback",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createRelease",
      description: "Create a new release / milestone.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the release" },
          startAt: {
            type: "string",
            description: "Optional ISO-8601 start date",
          },
          endAt: {
            type: "string",
            description: "Optional ISO-8601 end date",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateReleaseState",
      description:
        "Update the state of a release (PLANNED, ACTIVE, COMPLETED, CANCELLED).",
      parameters: {
        type: "object",
        properties: {
          releaseId: { type: "string", description: "ID of the release" },
          state: {
            type: "string",
            enum: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"],
            description: "New state for the release",
          },
        },
        required: ["releaseId", "state"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createInitiative",
      description: "Create a new initiative / strategic theme.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the initiative" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateInitiativeState",
      description:
        "Update the state of an initiative (PLANNED, ACTIVE, COMPLETED, CANCELLED).",
      parameters: {
        type: "object",
        properties: {
          initiativeId: {
            type: "string",
            description: "ID of the initiative",
          },
          state: {
            type: "string",
            enum: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"],
            description: "New state for the initiative",
          },
        },
        required: ["initiativeId", "state"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listFeatures",
      description:
        "List features, optionally filtered by status name. Returns id, title, and status.",
      parameters: {
        type: "object",
        properties: {
          statusName: {
            type: "string",
            description: "Optional status name filter (e.g. 'In Progress')",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 20)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listFeedback",
      description:
        "List recent feedback items. Returns title, sentiment, and creation date.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max results to return (default 20)",
          },
        },
      },
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────────────────

type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type CopilotActor = {
  id: string;
  user_metadata: {
    organization_role: string;
  };
};

function requireWriteAccess(actor: CopilotActor): ToolResult | null {
  if (actor.user_metadata.organization_role === RecoderPmRole.Member) {
    return {
      success: false,
      error: "You do not have permission to modify product data.",
    };
  }

  return null;
}

/**
 * Execute a tool call returned by the LLM.
 *
 * Uses the raw `@repo/backend/database` Prisma client (no session middleware)
 * so organizationId must be provided explicitly.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  organizationId: string,
  actor: CopilotActor
): Promise<ToolResult> {
  try {
    switch (name) {
      case "createFeature":
        return await handleCreateFeature(args, organizationId, actor);
      case "updateFeatureStatus":
        return await handleUpdateFeatureStatus(args, organizationId, actor);
      case "createFeedback":
        return await handleCreateFeedback(args, organizationId);
      case "createRelease":
        return await handleCreateRelease(args, organizationId, actor);
      case "updateReleaseState":
        return await handleUpdateReleaseState(args, organizationId, actor);
      case "createInitiative":
        return await handleCreateInitiative(args, organizationId, actor);
      case "updateInitiativeState":
        return await handleUpdateInitiativeState(args, organizationId, actor);
      case "listFeatures":
        return await handleListFeatures(args, organizationId);
      case "listFeedback":
        return await handleListFeedback(args, organizationId);
      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Copilot tool error", { tool: name, error: msg });
    return { success: false, error: msg };
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleCreateFeature(
  args: Record<string, unknown>,
  organizationId: string,
  actor: CopilotActor
): Promise<ToolResult> {
  const accessError = requireWriteAccess(actor);
  if (accessError) {
    return accessError;
  }

  const title = String(args.title ?? "").trim();
  if (!title) {
    return { success: false, error: "title is required" };
  }

  // Find the first (lowest-order) status for this org to use as default
  const defaultStatus = await database.featureStatus.findFirst({
    where: { organizationId },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  if (!defaultStatus) {
    return {
      success: false,
      error: "No feature statuses configured for this organization",
    };
  }

  const description = args.description ? String(args.description) : undefined;

  const feature = await database.feature.create({
    data: {
      title,
      organizationId,
      creatorId: actor.id,
      ownerId: actor.id,
      statusId: defaultStatus.id,
      ...(description ? { content: textToContent(description) } : {}),
    },
    select: { id: true, title: true },
  });

  return {
    success: true,
    data: { id: feature.id, title: feature.title },
  };
}

async function handleUpdateFeatureStatus(
  args: Record<string, unknown>,
  organizationId: string,
  actor: CopilotActor
): Promise<ToolResult> {
  const accessError = requireWriteAccess(actor);
  if (accessError) {
    return accessError;
  }

  const featureId = String(args.featureId ?? "").trim();
  const statusName = String(args.statusName ?? "").trim();
  if (!(featureId && statusName)) {
    return {
      success: false,
      error: "featureId and statusName are required",
    };
  }

  const status = await database.featureStatus.findFirst({
    where: {
      organizationId,
      name: { equals: statusName, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });

  if (!status) {
    return {
      success: false,
      error: `Status "${statusName}" not found. Check available statuses.`,
    };
  }

  const feature = await database.feature.findFirst({
    where: { id: featureId, organizationId },
    select: { id: true },
  });

  if (!feature) {
    return { success: false, error: "Feature not found in this organization" };
  }

  await database.feature.update({
    where: { id: feature.id },
    data: { statusId: status.id },
    select: { id: true },
  });

  return {
    success: true,
    data: { featureId, newStatus: status.name },
  };
}

async function handleCreateFeedback(
  args: Record<string, unknown>,
  organizationId: string
): Promise<ToolResult> {
  const title = String(args.title ?? "").trim();
  if (!title) {
    return { success: false, error: "title is required" };
  }

  const content = args.content
    ? textToContent(String(args.content))
    : textToContent("");

  const feedback = await database.feedback.create({
    data: {
      title,
      content,
      organizationId,
    },
    select: { id: true, title: true },
  });

  return {
    success: true,
    data: { id: feedback.id, title: feedback.title },
  };
}

async function handleCreateRelease(
  args: Record<string, unknown>,
  organizationId: string,
  actor: CopilotActor
): Promise<ToolResult> {
  const accessError = requireWriteAccess(actor);
  if (accessError) {
    return accessError;
  }

  const title = String(args.title ?? "").trim();
  if (!title) {
    return { success: false, error: "title is required" };
  }

  const startAt = args.startAt ? new Date(String(args.startAt)) : undefined;
  const endAt = args.endAt ? new Date(String(args.endAt)) : undefined;

  const release = await database.release.create({
    data: {
      title,
      organizationId,
      ...(startAt ? { startAt } : {}),
      ...(endAt ? { endAt } : {}),
    },
    select: { id: true, title: true },
  });

  return {
    success: true,
    data: { id: release.id, title: release.title },
  };
}

async function handleUpdateReleaseState(
  args: Record<string, unknown>,
  organizationId: string,
  actor: CopilotActor
): Promise<ToolResult> {
  const accessError = requireWriteAccess(actor);
  if (accessError) {
    return accessError;
  }

  const releaseId = String(args.releaseId ?? "").trim();
  const state = String(args.state ?? "").trim();
  if (!(releaseId && state)) {
    return { success: false, error: "releaseId and state are required" };
  }

  const validStates = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"];
  if (!validStates.includes(state)) {
    return {
      success: false,
      error: `Invalid state. Must be one of: ${validStates.join(", ")}`,
    };
  }

  // Verify the release belongs to this org
  const existing = await database.release.findFirst({
    where: { id: releaseId, organizationId },
    select: { id: true },
  });

  if (!existing) {
    return { success: false, error: "Release not found in this organization" };
  }

  await database.release.update({
    where: { id: releaseId },
    data: { state: state as "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED" },
    select: { id: true },
  });

  return { success: true, data: { releaseId, newState: state } };
}

async function handleCreateInitiative(
  args: Record<string, unknown>,
  organizationId: string,
  actor: CopilotActor
): Promise<ToolResult> {
  const accessError = requireWriteAccess(actor);
  if (accessError) {
    return accessError;
  }

  const title = String(args.title ?? "").trim();
  if (!title) {
    return { success: false, error: "title is required" };
  }

  const initiative = await database.$transaction(async (tx) => {
    const created = await tx.initiative.create({
      data: {
        title,
        organizationId,
        creatorId: actor.id,
        ownerId: actor.id,
        pages: {
          create: {
            title,
            creatorId: actor.id,
            default: true,
            content: textToContent(""),
          },
        },
      },
      select: { id: true, title: true },
    });

    await tx.initiativeMember.create({
      data: {
        userId: actor.id,
        initiativeId: created.id,
        creatorId: actor.id,
        organizationId,
      },
    });

    return created;
  });

  return {
    success: true,
    data: { id: initiative.id, title: initiative.title },
  };
}

async function handleUpdateInitiativeState(
  args: Record<string, unknown>,
  organizationId: string,
  actor: CopilotActor
): Promise<ToolResult> {
  const accessError = requireWriteAccess(actor);
  if (accessError) {
    return accessError;
  }

  const initiativeId = String(args.initiativeId ?? "").trim();
  const state = String(args.state ?? "").trim();
  if (!(initiativeId && state)) {
    return {
      success: false,
      error: "initiativeId and state are required",
    };
  }

  const validStates = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"];
  if (!validStates.includes(state)) {
    return {
      success: false,
      error: `Invalid state. Must be one of: ${validStates.join(", ")}`,
    };
  }

  // Verify ownership
  const existing = await database.initiative.findFirst({
    where: { id: initiativeId, organizationId },
    select: { id: true },
  });

  if (!existing) {
    return {
      success: false,
      error: "Initiative not found in this organization",
    };
  }

  await database.initiative.update({
    where: { id: initiativeId },
    data: {
      state: state as "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED",
    },
    select: { id: true },
  });

  return { success: true, data: { initiativeId, newState: state } };
}

async function handleListFeatures(
  args: Record<string, unknown>,
  organizationId: string
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 20, 50);
  const statusName = args.statusName
    ? String(args.statusName).trim()
    : undefined;

  const where: Record<string, unknown> = { organizationId };
  if (statusName) {
    where.status = { name: { equals: statusName, mode: "insensitive" } };
  }

  const features = await database.feature.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: { select: { name: true } },
      startAt: true,
      endAt: true,
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    data: features.map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status?.name ?? "Unknown",
      startAt: f.startAt?.toISOString() ?? null,
      endAt: f.endAt?.toISOString() ?? null,
    })),
  };
}

async function handleListFeedback(
  args: Record<string, unknown>,
  organizationId: string
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 20, 50);

  const items = await database.feedback.findMany({
    where: { organizationId },
    select: {
      id: true,
      title: true,
      aiSentiment: true,
      createdAt: true,
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    data: items.map((f) => ({
      id: f.id,
      title: f.title,
      sentiment: f.aiSentiment ?? "unknown",
      createdAt: f.createdAt.toISOString(),
    })),
  };
}
