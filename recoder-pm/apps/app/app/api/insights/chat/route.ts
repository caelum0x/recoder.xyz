import { getOrganizationTextModel } from "@repo/backend/ai";
import { withOrganizationSystemPrompt } from "@repo/backend/ai-prompts";
import { log } from "@repo/observability/log";
import { convertToModelMessages, streamText } from "ai";
import { database } from "@/lib/database";

export const maxDuration = 30;

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

  if (!messages || !Array.isArray(messages)) {
    return new Response("Messages array is required", { status: 400 });
  }

  if (messages.length === 0) {
    return new Response("Messages array must not be empty", { status: 400 });
  }

  // Log incoming message format for debugging
  log.info("Insights chat request", {
    organizationId,
    messageCount: messages.length,
    firstMessageKeys: messages[0] ? Object.keys(messages[0]) : [],
    firstMessageRole: messages[0]?.role,
  });

  try {
    // Gather product context: features, feedback, insights, releases
    const [features, feedbackItems, insights, releases] = await Promise.all([
      database.feature.findMany({
        where: { organizationId },
        select: { title: true, status: { select: { name: true } } },
        take: 20,
        orderBy: { createdAt: "desc" },
      }),
      database.feedback.findMany({
        where: { organizationId },
        select: { title: true, content: true, aiSentiment: true },
        take: 15,
        orderBy: { createdAt: "desc" },
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
      }),
      database.release.findMany({
        where: { organizationId },
        select: { title: true, state: true, endAt: true },
        take: 5,
        orderBy: { endAt: "desc" },
      }),
    ]);

    const context = [
      "## Product Context",
      `### Features (${features.length} recent)`,
      features
        .map((f) => `- ${f.title} [${f.status?.name || "unknown"}]`)
        .join("\n"),
      `### Recent Feedback (${feedbackItems.length})`,
      feedbackItems
        .map(
          (f) => `- ${f.title} (sentiment: ${f.aiSentiment || "unknown"})`
        )
        .join("\n"),
      `### AI Insights (${insights.length})`,
      insights
        .map(
          (i) =>
            `- [${i.type}] ${i.title} (confidence: ${i.confidence || "?"}%): ${i.description?.slice(0, 100) || ""}`
        )
        .join("\n"),
      `### Upcoming Releases (${releases.length})`,
      releases
        .map(
          (r) =>
            `- ${r.title} [${r.state}] ${r.endAt ? `due ${new Date(r.endAt).toLocaleDateString()}` : ""}`
        )
        .join("\n"),
    ].join("\n\n");

    const systemPrompt = await withOrganizationSystemPrompt(
      organizationId,
      `You are an AI product management co-pilot for the Recoder PM platform. You help product managers analyze data, prioritize features, understand user feedback, and make strategic decisions.

You have access to the following product data:

${context}

Be concise, data-driven, and actionable. When asked about priorities, reference the actual features and feedback. When asked about trends, analyze the sentiment data. Always suggest specific next steps.`
    );

    let modelMessages;
    try {
      modelMessages = convertToModelMessages(messages);
    } catch (conversionError) {
      log.error("Message conversion error", { error: conversionError, organizationId });
      return new Response(
        "Failed to process messages. Please try sending a new message.",
        { status: 400 }
      );
    }

    const result = streamText({
      model: await getOrganizationTextModel(organizationId),
      system: systemPrompt,
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    log.error("Insights chat error", { error, organizationId });
    return new Response(
      error instanceof Error ? error.message : "Internal server error",
      { status: 500 }
    );
  }
};
