import { RecoderPmRole } from "@repo/backend/auth";
import { withOrganizationSystemPrompt } from "@repo/backend/ai-prompts";
import { decryptApiKey } from "@repo/backend/ai-keys";
import { currentUser } from "@repo/backend/auth/utils";
import { contentToText } from "@repo/editor/lib/tiptap";
import { log } from "@repo/observability/log";
import { database } from "@/lib/database";
import {
  type CopilotActor,
  executeTool,
  toolDefinitions,
} from "./copilot-tools";

export const maxDuration = 60;

// OpenRouter config -- read once at module load
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_TEXT_MODEL || "google/gemini-2.0-flash-001";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = (() => {
  const configured = Number(process.env.OPENROUTER_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 45_000;
})();

// Max tool-call round-trips before giving up (prevents infinite loops)
const MAX_TOOL_ROUNDS = 5;

// ── Types for OpenRouter responses ──────────────────────────────────────────

type OpenRouterToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenRouterChoice = {
  message: {
    role: string;
    content: string | null;
    reasoning?: string | null;
    tool_calls?: OpenRouterToolCall[];
  };
  finish_reason: string;
};

type OpenRouterResponse = { choices: OpenRouterChoice[] };

type ChatMessage = {
  role: string;
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
  name?: string;
};

type OpenRouterConfig = {
  apiKey: string;
  model: string;
};

type SessionCookieUser = {
  id: string;
  email: string;
  hasOwnApiKey?: boolean;
  openRouterApiKey?: string | null;
  user_metadata?: {
    organization_id?: string | null;
    organization_role?: string | null;
    [key: string]: unknown;
  };
};

const SESSION_DATA_COOKIE_NAMES = [
  "_Secure-recoder.session_data",
  "__Secure-recoder.session_data",
  "recoder.session_data",
] as const;

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) {
          return [part, ""];
        }
        return [part.slice(0, index), part.slice(index + 1)];
      })
  );
}

function parseSessionDataCookie(rawValue: string | null | undefined) {
  if (!rawValue) {
    return null;
  }

  try {
    const decoded = Buffer.from(rawValue, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as {
      session?: { user?: SessionCookieUser };
    };

    return parsed.session?.user ?? null;
  } catch {
    return null;
  }
}

function getSessionCookieUser(req: Request): SessionCookieUser | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"));

  for (const name of SESSION_DATA_COOKIE_NAMES) {
    const user = parseSessionDataCookie(cookies[name]);
    if (user) {
      return user;
    }
  }

  return null;
}

async function resolveActorFromCookie(
  cookieUser: SessionCookieUser | null
): Promise<{
  actor: CopilotActor;
  organizationId: string | null;
} | null> {
  if (!cookieUser?.id) {
    return null;
  }

  const profile = await database.authUser.findUnique({
    where: { id: cookieUser.id },
    select: {
      id: true,
      organizationId: true,
      organizationRole: true,
    },
  });

  const organizationId =
    profile?.organizationId ??
    (typeof cookieUser.user_metadata?.organization_id === "string"
      ? cookieUser.user_metadata.organization_id
      : null);
  const organizationRole =
    profile?.organizationRole ??
    (typeof cookieUser.user_metadata?.organization_role === "string"
      ? cookieUser.user_metadata.organization_role
      : RecoderPmRole.Member);

  return {
    actor: {
      id: profile?.id ?? cookieUser.id,
      user_metadata: {
        organization_role: organizationRole,
      },
    },
    organizationId,
  };
}

// ── Content helpers ─────────────────────────────────────────────────────────

/**
 * Safely extract a text preview from a Feedback content field.
 * Content is stored as TipTap JSON, not a plain string.
 */
function feedbackContentPreview(content: unknown, maxLen = 100): string {
  if (!content) {
    return "";
  }
  try {
    if (typeof content === "object") {
      const text = contentToText(content as object);
      return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
    }
    if (typeof content === "string") {
      return content.length > maxLen
        ? `${content.slice(0, maxLen)}...`
        : content;
    }
  } catch {
    try {
      return JSON.stringify(content).slice(0, maxLen);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Extract text content from a message object.
 * Handles both UIMessage parts (AI SDK v5 format) and plain { content } strings.
 */
function extractText(msg: Record<string, unknown>): string {
  const parts = msg.parts;
  if (Array.isArray(parts)) {
    return parts
      .filter(
        (p: Record<string, unknown>) =>
          p?.type === "text" && typeof p.text === "string"
      )
      .map((p: Record<string, unknown>) => p.text as string)
      .join("");
  }
  if (typeof msg.content === "string") {
    return msg.content;
  }
  return "";
}

// ── Shared request helpers ──────────────────────────────────────────────────

function buildOpenRouterHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://pm.recoder.xyz",
    "X-Title": "Recoder PM Copilot",
  };
}

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "x-vercel-ai-ui-message-stream": "v1",
  "x-accel-buffering": "no",
};

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function openRouterTimeoutResponse(): Response {
  return Response.json(
    {
      error: `AI request timed out after ${Math.round(
        OPENROUTER_TIMEOUT_MS / 1000
      )}s`,
    },
    { status: 504 }
  );
}

function fetchOpenRouter(
  body: Record<string, unknown>,
  apiKey: string
): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers: buildOpenRouterHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
  });
}

async function fetchOpenRouterWithTimeoutHandling(
  body: Record<string, unknown>,
  apiKey: string,
  timeoutLog: Record<string, unknown>,
  timeoutMessage: string
): Promise<Response> {
  try {
    return await fetchOpenRouter(body, apiKey);
  } catch (error) {
    if (isTimeoutError(error)) {
      log.warn(timeoutMessage, {
        ...timeoutLog,
        timeoutMs: OPENROUTER_TIMEOUT_MS,
      });
      return openRouterTimeoutResponse();
    }
    throw error;
  }
}

function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

type StreamContext = {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  textPartId: string;
};

function emitStreamEnd(ctx: StreamContext, sentStart: boolean): void {
  if (sentStart) {
    ctx.controller.enqueue(
      ctx.encoder.encode(sseEvent({ type: "text-end", id: ctx.textPartId }))
    );
  }
  ctx.controller.enqueue(ctx.encoder.encode(sseEvent({ type: "finish-step" })));
  ctx.controller.enqueue(ctx.encoder.encode(sseEvent({ type: "finish" })));
  ctx.controller.enqueue(ctx.encoder.encode("data: [DONE]\n\n"));
  ctx.controller.close();
}

/**
 * Parse a single SSE data line and push UIMSP events if text content is found.
 * Returns the updated `sentStart` flag.
 */
function processSSELine(
  data: string,
  ctx: StreamContext,
  prevSentStart: boolean
): { sentStart: boolean; done: boolean } {
  if (data === "[DONE]") {
    emitStreamEnd(ctx, prevSentStart);
    return { sentStart: prevSentStart, done: true };
  }

  let updatedSentStart = prevSentStart;

  try {
    const parsed = JSON.parse(data);
    const delta = parsed.choices?.[0]?.delta;
    // Some free models (step-3.5-flash, nemotron) return content in reasoning field
    const content = delta?.content ?? delta?.reasoning ?? null;
    if (typeof content === "string" && content.length > 0) {
      if (!updatedSentStart) {
        ctx.controller.enqueue(
          ctx.encoder.encode(
            sseEvent({ type: "text-start", id: ctx.textPartId })
          )
        );
        updatedSentStart = true;
      }
      ctx.controller.enqueue(
        ctx.encoder.encode(
          sseEvent({
            type: "text-delta",
            id: ctx.textPartId,
            delta: content,
          })
        )
      );
    }
  } catch {
    // Skip malformed chunks
  }

  return { sentStart: updatedSentStart, done: false };
}

/**
 * Build a UIMSP streaming Response from an OpenRouter SSE stream.
 */
function streamToUIMSP(apiResponse: Response): Response {
  if (!apiResponse.body) {
    return Response.json(
      { error: "No response stream from AI service" },
      { status: 502 }
    );
  }

  const reader = apiResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sentStart = false;
  const ctx: StreamContext = {
    controller: undefined as unknown as ReadableStreamDefaultController,
    encoder: new TextEncoder(),
    textPartId: crypto.randomUUID(),
  };

  const stream = new ReadableStream({
    start(controller) {
      ctx.controller = controller;
      controller.enqueue(ctx.encoder.encode(sseEvent({ type: "start" })));
      controller.enqueue(ctx.encoder.encode(sseEvent({ type: "start-step" })));
    },
    async pull() {
      const readResult = await reader.read();
      if (readResult.done) {
        emitStreamEnd(ctx, sentStart);
        return;
      }

      buffer += decoder.decode(readResult.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed?.startsWith("data: ")) {
          continue;
        }
        const result = processSSELine(trimmed.slice(6), ctx, sentStart);
        sentStart = result.sentStart;
        if (result.done) {
          return;
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}

/**
 * Build a UIMSP response from a complete text string (no streaming needed).
 */
function textToUIMSP(text: string): Response {
  const encoder = new TextEncoder();
  const textPartId = crypto.randomUUID();

  const events = [
    sseEvent({ type: "start" }),
    sseEvent({ type: "start-step" }),
    sseEvent({ type: "text-start", id: textPartId }),
    sseEvent({ type: "text-delta", id: textPartId, delta: text }),
    sseEvent({ type: "text-end", id: textPartId }),
    sseEvent({ type: "finish-step" }),
    sseEvent({ type: "finish" }),
    "data: [DONE]\n\n",
  ];

  const body = encoder.encode(events.join(""));
  return new Response(body, { headers: STREAM_HEADERS });
}

// ── Workspace context builder ───────────────────────────────────────────────

type WorkspaceContext = {
  contextString: string;
  orgName: string;
};

async function fetchWorkspaceContext(
  organizationId: string
): Promise<WorkspaceContext> {
  const [org, features, feedbackItems, insights, releases, initiatives] =
    await Promise.all([
      database.organization
        .findUnique({
          where: { id: organizationId },
          select: { name: true, slug: true },
        })
        .catch((err: unknown) => {
          log.error("Failed to fetch organization", { error: String(err) });
          return null;
        }),
      database.feature
        .findMany({
          where: { organizationId },
          select: {
            id: true,
            title: true,
            status: { select: { name: true } },
            startAt: true,
            endAt: true,
          },
          take: 30,
          orderBy: { createdAt: "desc" },
        })
        .catch((err: unknown) => {
          log.error("Failed to fetch features", { error: String(err) });
          return [];
        }),
      database.feedback
        .findMany({
          where: { organizationId },
          select: {
            title: true,
            content: true,
            aiSentiment: true,
            createdAt: true,
          },
          take: 20,
          orderBy: { createdAt: "desc" },
        })
        .catch((err: unknown) => {
          log.error("Failed to fetch feedback", { error: String(err) });
          return [];
        }),
      database.aiInsight
        .findMany({
          where: { organizationId },
          select: {
            title: true,
            description: true,
            type: true,
            confidence: true,
          },
          take: 10,
          orderBy: { createdAt: "desc" },
        })
        .catch((err: unknown) => {
          log.error("Failed to fetch AI insights", { error: String(err) });
          return [];
        }),
      database.release
        .findMany({
          where: { organizationId },
          select: { id: true, title: true, state: true, endAt: true },
          take: 10,
          orderBy: { endAt: "desc" },
        })
        .catch((err: unknown) => {
          log.error("Failed to fetch releases", { error: String(err) });
          return [];
        }),
      database.initiative
        .findMany({
          where: { organizationId },
          select: { id: true, title: true, state: true },
          take: 10,
          orderBy: { createdAt: "desc" },
        })
        .catch((err: unknown) => {
          log.error("Failed to fetch initiatives", { error: String(err) });
          return [];
        }),
    ]);

  const orgName = org?.name || "your organization";

  const contextString = [
    `**Organization: ${orgName}**`,
    "",
    `### Features (${features.length})`,
    features
      .map((f) => `- [id:${f.id}] ${f.title} [${f.status?.name || "?"}]`)
      .join("\n") || "No features yet",
    "",
    `### Feedback (${feedbackItems.length})`,
    feedbackItems
      .map(
        (f) =>
          `- ${f.title}: ${feedbackContentPreview(f.content)} (sentiment: ${f.aiSentiment || "?"})`
      )
      .join("\n") || "No feedback yet",
    "",
    `### AI Insights (${insights.length})`,
    insights
      .map(
        (i) =>
          `- [${i.type}] ${i.title}: ${i.description?.slice(0, 100) || ""} (confidence: ${i.confidence || "?"})`
      )
      .join("\n") || "No insights computed yet",
    "",
    `### Releases (${releases.length})`,
    releases.map((r) => `- [id:${r.id}] ${r.title} [${r.state}]`).join("\n") ||
      "No releases yet",
    "",
    `### Initiatives (${(initiatives as Array<{ id: string; title: string; state: string }>).length})`,
    (initiatives as Array<{ id: string; title: string; state: string }>)
      .map((i) => `- [id:${i.id}] ${i.title} [${i.state}]`)
      .join("\n") || "No initiatives yet",
  ].join("\n");

  return { contextString, orgName };
}

async function resolveOpenRouterConfig(
  organizationId: string,
  cookieUser?: SessionCookieUser | null
): Promise<OpenRouterConfig | null> {
  const organization = await database.organization.findUnique({
    where: { id: organizationId },
    select: {
      aiProvider: true,
      aiModel: true,
      aiProviderKeys: {
        where: { isActive: true, provider: "openrouter" },
        select: {
          encryptedKey: true,
        },
        take: 1,
      },
    },
  });

  const keyRecord = organization?.aiProviderKeys.at(0);
  const organizationApiKey = keyRecord
    ? decryptApiKey(keyRecord.encryptedKey)
    : null;
  const userApiKey =
    cookieUser?.hasOwnApiKey && typeof cookieUser.openRouterApiKey === "string"
      ? cookieUser.openRouterApiKey
      : null;
  const apiKey = organizationApiKey ?? userApiKey ?? OPENROUTER_API_KEY ?? null;

  if (!apiKey) {
    return null;
  }

  const model =
    organization?.aiProvider === "openrouter" && organization.aiModel
      ? organization.aiModel
      : OPENROUTER_MODEL;

  return { apiKey, model };
}

// ── Tool-call loop ──────────────────────────────────────────────────────────

/**
 * Execute the tool-calling loop. Returns a Response (either UIMSP text
 * from a non-streaming completion, or a streaming fallback if we exhaust
 * the round limit).
 */
async function runToolCallLoop(
  apiMessages: ChatMessage[],
  organizationId: string,
  actor: CopilotActor,
  openRouterConfig: OpenRouterConfig
): Promise<Response> {
  for (let round = 1; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await fetchOpenRouterWithTimeoutHandling(
      {
        model: openRouterConfig.model,
        messages: apiMessages,
        tools: toolDefinitions,
        tool_choice: "auto",
        stream: false,
      },
      openRouterConfig.apiKey,
      { organizationId, round },
      "OpenRouter non-stream request timed out"
    );

    if (response.status === 504) {
      return response;
    }

    if (!response.ok) {
      const errText = await response.text();
      log.error("OpenRouter non-stream error", {
        status: response.status,
        body: errText.slice(0, 200),
      });
      return Response.json(
        { error: `AI service error (${response.status})` },
        { status: 502 }
      );
    }

    const result: OpenRouterResponse = await response.json();
    const choice = result.choices?.[0];

    if (!choice) {
      return Response.json(
        { error: "Empty response from AI service" },
        { status: 502 }
      );
    }

    const toolCalls = choice.message.tool_calls;

    // No tool calls — the model produced a final text response
    if (!toolCalls || toolCalls.length === 0) {
      return textToUIMSP(
        choice.message.content || choice.message.reasoning || ""
      );
    }

    // Execute tool calls
    log.info("Copilot tool calls", {
      round,
      tools: toolCalls.map((tc) => tc.function.name),
      organizationId,
    });

    apiMessages.push({
      role: "assistant",
      content: choice.message.content,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const args = parseToolArgs(toolCall);
      const toolResult = await executeTool(
        toolCall.function.name,
        args,
        organizationId,
        actor
      );
      apiMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Exhausted round limit — final streaming call without tools
  return await finalStreamingCall(
    apiMessages,
    organizationId,
    openRouterConfig
  );
}

function parseToolArgs(toolCall: OpenRouterToolCall): Record<string, unknown> {
  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    log.error("Failed to parse tool arguments", {
      tool: toolCall.function.name,
      raw: toolCall.function.arguments,
    });
    return {};
  }
}

async function finalStreamingCall(
  apiMessages: ChatMessage[],
  organizationId: string,
  openRouterConfig: OpenRouterConfig
): Promise<Response> {
  log.warn("Copilot hit max tool rounds", {
    rounds: MAX_TOOL_ROUNDS,
    organizationId,
  });

  const response = await fetchOpenRouterWithTimeoutHandling(
    {
      model: openRouterConfig.model,
      messages: apiMessages,
      stream: true,
    },
    openRouterConfig.apiKey,
    { organizationId },
    "OpenRouter final stream request timed out"
  );

  if (response.status === 504) {
    return response;
  }

  if (!response.ok) {
    const errText = await response.text();
    log.error("OpenRouter final stream error", {
      status: response.status,
      body: errText.slice(0, 200),
    });
    return Response.json(
      { error: `AI service error (${response.status})` },
      { status: 502 }
    );
  }

  return streamToUIMSP(response);
}

// ── System prompt builder ───────────────────────────────────────────────────

const SYSTEM_PROMPT_TEMPLATE = `You are a product management co-pilot for the user's workspace. You help them manage THEIR products — not Recoder's products.

Your role:
- Help the user understand their product data: features, feedback, releases, insights
- Assist with prioritization, roadmap planning, and decision-making
- Analyze user feedback patterns and suggest improvements
- Help draft release notes, feature specs, and status updates
- Answer questions about their workspace data shown below
- **Create and update** features, feedback, releases, and initiatives when the user asks you to

When the user asks to "show projects" or "what are my features", present the data below in a clean, organized way.
When they ask for analysis, provide actionable insights based on the data.
When they ask you to create or update items, use the available tools. After using a tool, confirm what you did.

IMPORTANT: Each feature, release, and initiative in the data below includes its ID in [id:...] format. Use these IDs when the user asks you to update an existing item.

Their workspace data:
{{CONTEXT}}

Be concise and actionable. Use markdown formatting. Never reference "Recoder" as a product — this data belongs to the user's organization.`;

// ── Main handler ────────────────────────────────────────────────────────────

export const POST = async (req: Request) => {
  const validated = await validateRequest(req);
  if (validated instanceof Response) {
    return validated;
  }

  const { chatMessages, organizationId, actor, cookieUser } = validated;

  try {
    const { contextString } = await fetchWorkspaceContext(organizationId);
    const openRouterConfig = await resolveOpenRouterConfig(
      organizationId,
      cookieUser
    );

    if (!openRouterConfig) {
      log.error("Insights chat OpenRouter credentials are not configured", {
        organizationId,
      });
      return Response.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
    }

    const systemPrompt = await withOrganizationSystemPrompt(
      organizationId,
      SYSTEM_PROMPT_TEMPLATE.replace("{{CONTEXT}}", contextString)
    );

    const apiMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...chatMessages,
    ];

    return await runToolCallLoop(
      apiMessages,
      organizationId,
      actor,
      openRouterConfig
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Insights chat error", {
      error: msg,
      stack: error instanceof Error ? error.stack : undefined,
      organizationId,
    });
    return Response.json(
      { error: msg || "Internal server error" },
      { status: 500 }
    );
  }
};

// ── Request validation ──────────────────────────────────────────────────────

type ValidatedRequest = {
  chatMessages: Array<{ role: string; content: string }>;
  organizationId: string;
  actor: CopilotActor;
  cookieUser: SessionCookieUser | null;
};

async function validateRequest(
  req: Request
): Promise<ValidatedRequest | Response> {
  let body: { messages?: unknown; organizationId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const cookieUser = getSessionCookieUser(req);
  const user = await currentUser();
  const fallbackActor = !user ? await resolveActorFromCookie(cookieUser) : null;
  const resolvedOrganizationId =
    typeof body.organizationId === "string" && body.organizationId.trim()
      ? body.organizationId.trim()
      : user?.organizationId ??
        fallbackActor?.organizationId ??
        null;

  if (!resolvedOrganizationId) {
    return new Response("Organization ID required", { status: 400 });
  }

  const { messages } = body;
  const cookieUser = getSessionCookieUser(req);

  // Verify the authenticated user belongs to this organization
  const actor = user ?? fallbackActor?.actor ?? null;
  const actorOrganizationId =
    user?.organizationId ?? fallbackActor?.organizationId ?? null;

  if (!actor || !actorOrganizationId || actorOrganizationId !== resolvedOrganizationId) {
    return new Response("Unauthorized", { status: 403 });
  }

  if (!(messages && Array.isArray(messages)) || messages.length === 0) {
    return new Response("Messages required", { status: 400 });
  }

  const chatMessages: Array<{ role: string; content: string }> = messages
    .filter((m: Record<string, unknown>) =>
      ["user", "assistant", "system"].includes(m.role as string)
    )
    .map((m: Record<string, unknown>) => ({
      role: m.role as string,
      content: extractText(m),
    }))
    .filter((m) => m.content.length > 0);

  if (chatMessages.length === 0) {
    return new Response("No message content", { status: 400 });
  }

  return {
    chatMessages,
    organizationId: resolvedOrganizationId,
    actor,
    cookieUser,
  };
}
