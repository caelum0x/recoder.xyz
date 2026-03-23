import { withOrganizationSystemPrompt } from "@repo/backend/ai-prompts";
import { log } from "@repo/observability/log";
import { database } from "@/lib/database";

export const maxDuration = 60;

// OpenRouter config — read once at module load
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_TEXT_MODEL || "openai/gpt-4o-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Extract text content from UIMessage parts (AI SDK v5 format)
 * or from plain content string (v3 format).
 */
function extractText(msg: Record<string, unknown>): string {
  const parts = msg.parts;
  if (Array.isArray(parts)) {
    return parts
      .filter((p: Record<string, unknown>) => p?.type === "text" && typeof p.text === "string")
      .map((p: Record<string, unknown>) => p.text as string)
      .join("");
  }
  if (typeof msg.content === "string") return msg.content;
  return "";
}

export const POST = async (req: Request) => {
  console.log("[insights/chat] POST received, content-length:", req.headers.get("content-length"));

  // --- Parse request ---
  let body: { messages?: unknown; organizationId?: string };
  try {
    const rawText = await req.text();
    console.log("[insights/chat] body length:", rawText.length);
    if (!rawText || rawText.length === 0) {
      console.error("[insights/chat] EMPTY BODY — this is the 400 source");
      return new Response("Empty request body", { status: 400 });
    }
    body = JSON.parse(rawText);
  } catch (e) {
    console.error("[insights/chat] JSON parse error:", e instanceof Error ? e.message : String(e));
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { messages, organizationId } = body;
  if (!organizationId) return new Response("Organization ID required", { status: 400 });
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Messages required", { status: 400 });
  }
  if (!OPENROUTER_API_KEY) return new Response("AI provider not configured", { status: 500 });

  // --- Convert messages ---
  const chatMessages: Array<{ role: string; content: string }> = messages
    .filter((m: Record<string, unknown>) => ["user", "assistant", "system"].includes(m.role as string))
    .map((m: Record<string, unknown>) => ({ role: m.role as string, content: extractText(m) }))
    .filter((m) => m.content.length > 0);

  // Debug: log what messages look like
  console.log("[insights/chat] messages:", JSON.stringify(messages.map((m: Record<string, unknown>) => ({
    role: m.role,
    hasContent: typeof m.content === "string",
    contentLen: typeof m.content === "string" ? (m.content as string).length : 0,
    hasParts: Array.isArray(m.parts),
    partsLen: Array.isArray(m.parts) ? m.parts.length : 0,
    partTypes: Array.isArray(m.parts) ? m.parts.map((p: Record<string, unknown>) => p.type) : [],
    extractedLen: extractText(m).length,
  }))));

  if (chatMessages.length === 0) return new Response("No message content", { status: 400 });

  try {
    // --- Gather product context ---
    const [features, feedbackItems, insights, releases] = await Promise.all([
      database.feature.findMany({
        where: { organizationId },
        select: { title: true, status: { select: { name: true } } },
        take: 20, orderBy: { createdAt: "desc" },
      }),
      database.feedback.findMany({
        where: { organizationId },
        select: { title: true, content: true, aiSentiment: true },
        take: 15, orderBy: { createdAt: "desc" },
      }),
      database.aiInsight.findMany({
        where: { organizationId },
        select: { title: true, description: true, type: true, confidence: true },
        take: 10, orderBy: { createdAt: "desc" },
      }),
      database.release.findMany({
        where: { organizationId },
        select: { title: true, state: true, endAt: true },
        take: 5, orderBy: { endAt: "desc" },
      }),
    ]);

    const context = [
      `### Features (${features.length})`,
      features.map((f) => `- ${f.title} [${f.status?.name || "?"}]`).join("\n"),
      `### Feedback (${feedbackItems.length})`,
      feedbackItems.map((f) => `- ${f.title} (${f.aiSentiment || "?"})`).join("\n"),
      `### Insights (${insights.length})`,
      insights.map((i) => `- [${i.type}] ${i.title}: ${i.description?.slice(0, 80) || ""}`).join("\n"),
      `### Releases (${releases.length})`,
      releases.map((r) => `- ${r.title} [${r.state}]`).join("\n"),
    ].join("\n\n");

    const systemPrompt = await withOrganizationSystemPrompt(
      organizationId,
      `You are a product management co-pilot. Help analyze data, prioritize features, and make decisions.\n\nProduct data:\n${context}\n\nBe concise and actionable.`
    );

    // --- Call OpenRouter directly (no AI SDK) ---
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...chatMessages,
    ];

    const apiResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
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
      console.error("[insights/chat] OpenRouter error:", apiResponse.status, errText.slice(0, 200));
      return new Response(`AI service error: ${apiResponse.status}`, { status: 502 });
    }

    if (!apiResponse.body) {
      return new Response("No response stream", { status: 502 });
    }

    // --- Transform OpenRouter SSE → UI Message Stream Protocol ---
    // OpenRouter sends: data: {"choices":[{"delta":{"content":"text"}}]}
    // useChat expects: 0:"text"\n (text part) then d:{"finishReason":"stop"}\n
    const reader = apiResponse.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Transform OpenRouter SSE → UI Message Stream Protocol (AI SDK v5)
    // Format: SSE with JSON objects like {"type":"text-delta","delta":"Hello"}
    let buffer = "";
    const textPartId = crypto.randomUUID();
    let sentStart = false;
    // sentLifecycle tracked via start() callback below

    const stream = new ReadableStream({
      start(controller) {
        // Send lifecycle events that useChat expects
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "start-step" })}\n\n`));
        // lifecycle events sent
      },
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            if (sentStart) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-end", id: textPartId })}\n\n`));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish-step" })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish" })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              if (sentStart) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-end", id: textPartId })}\n\n`));
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish-step" })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish" })}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (typeof content === "string" && content.length > 0) {
                if (!sentStart) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-start", id: textPartId })}\n\n`));
                  sentStart = true;
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-delta", id: textPartId, delta: content })}\n\n`));
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
        "Connection": "keep-alive",
        "x-vercel-ai-ui-message-stream": "v1",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[insights/chat] ERROR:", msg);
    log.error("Insights chat error", { error, organizationId });
    return new Response(msg || "Internal server error", { status: 500 });
  }
};
