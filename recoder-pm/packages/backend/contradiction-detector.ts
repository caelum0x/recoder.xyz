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

export const detectContradictions = async () => {
  const organizations = await database.organization.findMany({
    select: { id: true },
  });

  for (const organization of organizations) {
    try {
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

      const [
        feedback,
        supportTickets,
        recordings,
        interviews,
        analyticsEvents,
      ] = await Promise.all([
        database.feedback.findMany({
          where: { organizationId: organization.id, createdAt: { gt: since } },
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { title: true, content: true },
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
        database.analyticsEvent.findMany({
          where: { organizationId: organization.id, createdAt: { gt: since } },
          take: 20,
          orderBy: { occurredAt: "desc" },
          select: { name: true, properties: true },
        }),
      ]);

      if (
        !(
          feedback.length &&
          supportTickets.length &&
          recordings.length &&
          interviews.length &&
          analyticsEvents.length
        )
      ) {
        continue;
      }

      const prompt = await withOrganizationUserPrompt(
        organization.id,
        [
          "You identify contradictions between qualitative signals (feedback, support, recordings, interviews) and quantitative usage (analytics events).",
          "Return 2-4 contradictions with type, title, description, and confidence (0-100).",
          "Types: FEEDBACK_VS_USAGE, SUPPORT_VS_USAGE, RECORDING_VS_USAGE, INTERVIEW_VS_USAGE.",
          "Keep responses concise and avoid markdown.",
          "",
          "Feedback:",
          toSummaryList(
            feedback.map(
              (item) => `${item.title}: ${contentToText(item.content)}`
            )
          ),
          "",
          "Support tickets:",
          toSummaryList(
            supportTickets.map(
              (ticket) => `${ticket.subject ?? "Ticket"}: ${ticket.content}`
            )
          ),
          "",
          "Session recordings:",
          toSummaryList(
            recordings.map(
              (recording) =>
                `${recording.insightType}: ${recording.description ?? ""} ${recording.pageUrl ?? ""}`
            )
          ),
          "",
          "Interviews:",
          toSummaryList(
            interviews.map(
              (interview) =>
                `${interview.title}: ${contentToText(interview.transcript)}`
            )
          ),
          "",
          "Analytics events:",
          toSummaryList(
            analyticsEvents.map(
              (event) =>
                `${event.name} ${JSON.stringify(event.properties ?? {})}`
            )
          ),
        ].join("\n")
      );

      const { object } = await generateObject({
        model: await getOrganizationTextModel(organization.id),
        prompt,
        schema: z.object({
          contradictions: z.array(
            z.object({
              type: z.enum([
                "FEEDBACK_VS_USAGE",
                "SUPPORT_VS_USAGE",
                "RECORDING_VS_USAGE",
                "INTERVIEW_VS_USAGE",
              ]),
              title: z.string(),
              description: z.string(),
              confidence: z.number().min(0).max(100),
            })
          ),
        }),
      });

      for (const contradiction of object.contradictions) {
        const exists = await database.contradiction.findFirst({
          where: {
            organizationId: organization.id,
            title: contradiction.title,
            createdAt: { gt: since },
          },
          select: { id: true },
        });

        if (exists) {
          continue;
        }

        await database.contradiction.create({
          data: {
            organizationId: organization.id,
            type: contradiction.type,
            title: contradiction.title,
            description: contradiction.description,
            confidence: Math.round(contradiction.confidence),
            sources: {
              feedbackCount: feedback.length,
              supportCount: supportTickets.length,
              recordingCount: recordings.length,
              interviewCount: interviews.length,
              analyticsCount: analyticsEvents.length,
            },
          },
          select: { id: true },
        });
      }
    } catch (error) {
      log.error("Contradiction detection failed", error);
    }
  }
};
