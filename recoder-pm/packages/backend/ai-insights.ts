import "server-only";
import { contentToText } from "@repo/editor/lib/tiptap";
import { log } from "@repo/observability/log";
import { generateObject } from "ai";
import { z } from "zod/v3";
import { getOrganizationTextModel } from "./ai";
import { withOrganizationUserPrompt } from "./ai-prompts";
import { database } from "./database";

const lookbackDays = 14;

const toSummaryList = (items: string[], limit = 6) =>
  items
    .filter((item) => item.trim())
    .slice(0, limit)
    .map((item) => `- ${item}`)
    .join("\n");

export const synthesizeAiInsights = async () => {
  const organizations = await database.organization.findMany({
    select: { id: true },
  });

  for (const organization of organizations) {
    try {
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

      const [
        feedback,
        analyticsEvents,
        supportTickets,
        sessionInsights,
        interviews,
      ] = await Promise.all([
        database.feedback.findMany({
          where: { organizationId: organization.id, createdAt: { gt: since } },
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { title: true, content: true },
        }),
        database.analyticsEvent.findMany({
          where: { organizationId: organization.id, createdAt: { gt: since } },
          take: 20,
          orderBy: { occurredAt: "desc" },
          select: { name: true, properties: true },
        }),
        database.supportTicket.findMany({
          where: { organizationId: organization.id, createdAt: { gt: since } },
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { subject: true, content: true },
        }),
        database.sessionRecordingInsight.findMany({
          where: { organizationId: organization.id, createdAt: { gt: since } },
          take: 20,
          orderBy: { occurredAt: "desc" },
          select: { insightType: true, description: true, pageUrl: true },
        }),
        database.interview.findMany({
          where: { organizationId: organization.id, createdAt: { gt: since } },
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { title: true, transcript: true },
        }),
      ]);

      const hasData =
        feedback.length ||
        analyticsEvents.length ||
        supportTickets.length ||
        sessionInsights.length ||
        interviews.length;

      if (!hasData) {
        continue;
      }

      const prompt = await withOrganizationUserPrompt(
        organization.id,
        [
          "You are an AI analyst generating product insights for a PM.",
          "Based on the following data summaries, create 3-5 concise insights.",
          "Each insight should have a short title, a 2-3 sentence description, a confidence score (0-100), and a type.",
          "Types: FEEDBACK, USAGE, SUPPORT, RECORDING, INTERVIEW, MIXED.",
          "Avoid markdown. Keep titles under 80 characters.",
          "",
          "Feedback:",
          toSummaryList(
            feedback.map(
              (item) => `${item.title}: ${contentToText(item.content)}`
            )
          ),
          "",
          "Product Analytics Events:",
          toSummaryList(
            analyticsEvents.map(
              (event) =>
                `${event.name} ${JSON.stringify(event.properties ?? {})}`
            )
          ),
          "",
          "Support Tickets:",
          toSummaryList(
            supportTickets.map(
              (ticket) =>
                `${ticket.subject ?? "Support ticket"}: ${ticket.content}`
            )
          ),
          "",
          "Session Recording Insights:",
          toSummaryList(
            sessionInsights.map(
              (insight) =>
                `${insight.insightType}: ${insight.description ?? ""} ${insight.pageUrl ?? ""}`
            )
          ),
          "",
          "Interviews:",
          toSummaryList(
            interviews.map(
              (interview) =>
                `${interview.title}: ${contentToText(interview.transcript)}`
            ),
            4
          ),
        ].join("\n")
      );

      const { object } = await generateObject({
        model: await getOrganizationTextModel(organization.id),
        prompt,
        schema: z.object({
          insights: z
            .array(
              z.object({
                title: z.string(),
                description: z.string(),
                confidence: z.number().min(0).max(100),
                type: z.enum([
                  "FEEDBACK",
                  "USAGE",
                  "SUPPORT",
                  "RECORDING",
                  "INTERVIEW",
                  "MIXED",
                ]),
              })
            )
            .min(1),
        }),
      });

      for (const insight of object.insights) {
        const exists = await database.aiInsight.findFirst({
          where: {
            organizationId: organization.id,
            title: insight.title,
            createdAt: { gt: since },
          },
          select: { id: true },
        });

        if (exists) {
          continue;
        }

        await database.aiInsight.create({
          data: {
            organizationId: organization.id,
            type: insight.type,
            title: insight.title,
            description: insight.description,
            confidence: Math.round(insight.confidence),
            sources: {
              feedbackCount: feedback.length,
              analyticsCount: analyticsEvents.length,
              supportCount: supportTickets.length,
              recordingCount: sessionInsights.length,
              interviewCount: interviews.length,
            },
          },
          select: { id: true },
        });
      }
    } catch (error) {
      log.error("AI insight synthesis failed", error);
    }
  }
};
