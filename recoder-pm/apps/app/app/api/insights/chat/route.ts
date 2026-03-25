import { withOrganizationSystemPrompt } from "@repo/backend/ai-prompts";
import { contentToText } from "@repo/editor/lib/tiptap";
import { log } from "@repo/observability/log";
import { database } from "@/lib/database";

export const maxDuration = 60;

// OpenRouter config -- read once at module load
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_TEXT_MODEL || "openai/gpt-4o-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Safely extract a text preview from a Feedback content field.
 * Content is stored as TipTap JSON, not a plain string.
 */
function feedbackContentPreview(
  content: unknown,
  maxLen = 100
): string {
  if (!content) {
    return "";
  }
  try {
    // TipTap JSON document
    if (typeof content === "object") {
      const text = contentToText(content as object);
      return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
    }
    // Fallback: plain string (shouldn't happen, but be safe)
    if (typeof content === "string") {
      return content.length > maxLen
        ? `${content.slice(0, maxLen)}...`
        : content;
    }
  } catch {
    // If contentToText fails, try JSON.stringify
    try {
      const raw = JSON.stringify(content).slice(0, maxLen);
      return raw;
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

export const POST = async (req: Request) => {
  let body: { messages?: unknown; organizationId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { messages, organizationId } = body;
  if (!organizationId) {
    return new Response("Organization ID required", { status: 400 });
  }
  if (!(messages && Array.isArray(messages)) || messages.length === 0) {
    return new Response("Messages required", { status: 400 });
  }
  if (!OPENROUTER_API_KEY) {
    log.error("OPENROUTER_API_KEY is not set");
    return Response.json(
      { error: "AI service not configured" },
      { status: 503 }
    );
  }

  // Convert messages to plain { role, content } for OpenRouter
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

  try {
    // Gather product context from user's workspace
    // Each query gets its own .catch so one table failure doesn't crash the whole route
    const [org, features, feedbackItems, insights, releases, initiatives] = await Promise.all([
      database.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, slug: true },
      }).catch((err: unknown) => {
        log.error("Failed to fetch organization", { error: String(err) });
        return null;
      }),
      database.feature.findMany({
        where: { organizationId },
        select: { id: true, title: true, status: { select: { name: true } }, startAt: true, endAt: true },
        take: 30,
        orderBy: { createdAt: "desc" },
      }).catch((err: unknown) => {
        log.error("Failed to fetch features", { error: String(err) });
        return [];
      }),
      database.feedback.findMany({
        where: { organizationId },
        select: { title: true, content: true, aiSentiment: true, createdAt: true },
        take: 20,
        orderBy: { createdAt: "desc" },
      }).catch((err: unknown) => {
        log.error("Failed to fetch feedback", { error: String(err) });
        return [];
      }),
      database.aiInsight.findMany({
        where: { organizationId },
        select: {
          title: true,
          description: true,
          type: true,
          confidence: true,
        },
        take: 10,
        orderBy: { createdAt: "desc" },
      }).catch((err: unknown) => {
        log.error("Failed to fetch AI insights", { error: String(err) });
        return [];
      }),
      database.release.findMany({
        where: { organizationId },
        select: { title: true, state: true, endAt: true },
        take: 10,
        orderBy: { endAt: "desc" },
      }).catch((err: unknown) => {
        log.error("Failed to fetch releases", { error: String(err) });
        return [];
      }),
      database.initiative.findMany({
        where: { organizationId },
        select: { title: true, state: true },
        take: 10,
        orderBy: { createdAt: "desc" },
      }).catch((err: unknown) => {
        log.error("Failed to fetch initiatives", { error: String(err) });
        return [];
      }),
    ]);

    const orgName = org?.name || "your organization";

    const context = [
      `**Organization: ${orgName}**`,
      "",
      `### Features (${features.length})`,
      features.map((f) => `- ${f.title} [${f.status?.name || "?"}]`).join("\n") || "No features yet",
      "",
      `### Feedback (${feedbackItems.length})`,
      feedbackItems
        .map((f) => `- ${f.title}: ${feedbackContentPreview(f.content)} (sentiment: ${f.aiSentiment || "?"})`)
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
      releases.map((r) => `- ${r.title} [${r.state}]`).join("\n") || "No releases yet",
      "",
      `### Initiatives (${(initiatives as Array<{title: string; state: string}>).length})`,
      (initiatives as Array<{title: string; state: string}>).map((i) => `- ${i.title} [${i.state}]`).join("\n") || "No initiatives yet",
    ].join("\n");

    const systemPrompt = await withOrganizationSystemPrompt(
      organizationId,
      `You are a product management co-pilot for the user's workspace. You help them manage THEIR products — not Recoder's products.

Your role:
- Help the user understand their product data: features, feedback, releases, insights
- Assist with prioritization, roadmap planning, and decision-making
- Analyze user feedback patterns and suggest improvements
- Help draft release notes, feature specs, and status updates
- Answer questions about their workspace data shown below

When the user asks to "show projects" or "what are my features", present the data below in a clean, organized way.
When they ask for analysis, provide actionable insights based on the data.

Their workspace data:
${context}

Be concise and actionable. Use markdown formatting. Never reference "Recoder" as a product — this data belongs to the user's organization.`
    );

    // Call OpenRouter directly (no AI SDK)
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...chatMessages,
    ];

    const apiResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pm.recoder.xyz",
        "X-Title": "Recoder PM Copilot",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: apiMessages,
        stream: true,
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      log.error("OpenRouter error", {
        status: apiResponse.status,
        body: errText.slice(0, 200),
      });
      return Response.json(
        { error: `AI service error (${apiResponse.status})` },
        { status: 502 }
      );
    }

    if (!apiResponse.body) {
      return Response.json(
        { error: "No response stream from AI service" },
        { status: 502 }
      );
    }

    // Transform OpenRouter SSE -> UI Message Stream Protocol (AI SDK v5)
    const reader = apiResponse.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";
    const textPartId = crypto.randomUUID();
    let sentStart = false;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`)
        );
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "start-step" })}\n\n`)
        );
      },
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            if (sentStart) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text-end", id: textPartId })}\n\n`
                )
              );
            }
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "finish-step" })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "finish" })}\n\n`)
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed?.startsWith("data: ")) {
              continue;
            }
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              if (sentStart) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "text-end", id: textPartId })}\n\n`
                  )
                );
              }
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "finish-step" })}\n\n`
                )
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "finish" })}\n\n`
                )
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (typeof content === "string" && content.length > 0) {
                if (!sentStart) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "text-start", id: textPartId })}\n\n`
                    )
                  );
                  sentStart = true;
                }
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "text-delta", id: textPartId, delta: content })}\n\n`
                  )
                );
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "x-vercel-ai-ui-message-stream": "v1",
        "x-accel-buffering": "no",
      },
    });
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
