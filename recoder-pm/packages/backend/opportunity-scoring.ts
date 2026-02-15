import "server-only";
import { contentToText } from "@repo/editor/lib/tiptap";
import { log } from "@repo/observability/log";
import { generateObject } from "ai";
import { z } from "zod/v3";
import { getOrganizationTextModel } from "./ai";
import { withOrganizationUserPrompt } from "./ai-prompts";
import { database } from "./database";

const lookbackDays = 30;

const toSummaryList = (items: string[], limit = 6) =>
  items
    .filter((item) => item.trim())
    .slice(0, limit)
    .map((item) => `- ${item}`)
    .join("\n");

export const runOpportunityScoring = async () => {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const features = await database.feature.findMany({
    where: {
      aiRice: {
        OR: [{ is: null }, { updatedAt: { lt: since } }],
      },
    },
    include: {
      aiRice: true,
      organization: {
        select: { productDescription: true },
      },
    },
    take: 50,
  });

  for (const feature of features) {
    try {
      const [
        feedbackLinks,
        supportTickets,
        sessionInsights,
        interviews,
        analyticsEvents,
      ] = await Promise.all([
        database.feedbackFeatureLink.findMany({
          where: {
            featureId: feature.id,
            createdAt: { gt: since },
          },
          select: {
            feedback: {
              select: { title: true, content: true },
            },
          },
          take: 10,
        }),
        database.supportTicket.findMany({
          where: {
            organizationId: feature.organizationId,
            createdAt: { gt: since },
          },
          select: { subject: true, content: true },
          take: 10,
        }),
        database.sessionRecordingInsight.findMany({
          where: {
            organizationId: feature.organizationId,
            createdAt: { gt: since },
          },
          select: { insightType: true, description: true },
          take: 10,
        }),
        database.interview.findMany({
          where: {
            organizationId: feature.organizationId,
            createdAt: { gt: since },
          },
          select: { title: true, transcript: true },
          take: 5,
        }),
        database.analyticsEvent.findMany({
          where: {
            organizationId: feature.organizationId,
            createdAt: { gt: since },
          },
          select: { name: true, properties: true },
          take: 10,
        }),
      ]);

      const feedbackSummaries = feedbackLinks.map((link) => {
        const title = link.feedback?.title ?? "Feedback";
        const content = link.feedback?.content
          ? contentToText(link.feedback.content)
          : "";
        return `${title}: ${content}`;
      });

      const prompt = await withOrganizationUserPrompt(
        feature.organizationId,
        [
          "You are an AI that determines the RICE score of a product feature, where:",
          "- Reach is the number of people who will be affected by the feature. This can be between 0 and 100.",
          "- Impact is the impact the feature will have on the users. This can be 1 (minimal), 2 (low), 3 (medium), 4 (high), or 5 (massive).",
          "- Confidence is the level of confidence in your estimates. This can be between 0 (0%) and 100 (100%).",
          "- Effort is the level of effort required to build and ship the feature. This can be between 0 (0%) and 10 (100%).",
          "Use the provided signals (feedback, support, recordings, interviews, analytics) to inform your estimates.",
          "",
          `Feature name: ${feature.title}`,
          "------",
          "Feature description:",
          feature.content ? contentToText(feature.content) : "None provided.",
          "------",
          "Product description:",
          feature.organization?.productDescription ?? "None provided.",
          "------",
          `Feedback links in last ${lookbackDays} days: ${feedbackLinks.length}`,
          toSummaryList(feedbackSummaries),
          "------",
          `Support tickets in last ${lookbackDays} days: ${supportTickets.length}`,
          toSummaryList(
            supportTickets.map(
              (ticket) => `${ticket.subject ?? "Ticket"}: ${ticket.content}`
            )
          ),
          "------",
          `Session recording insights in last ${lookbackDays} days: ${sessionInsights.length}`,
          toSummaryList(
            sessionInsights.map(
              (insight) =>
                `${insight.insightType}: ${insight.description ?? ""}`
            )
          ),
          "------",
          `Interviews in last ${lookbackDays} days: ${interviews.length}`,
          toSummaryList(
            interviews.map(
              (interview) =>
                `${interview.title}: ${contentToText(interview.transcript)}`
            ),
            4
          ),
          "------",
          `Analytics events in last ${lookbackDays} days: ${analyticsEvents.length}`,
          toSummaryList(
            analyticsEvents.map(
              (event) =>
                `${event.name} ${JSON.stringify(event.properties ?? {})}`
            )
          ),
        ].join("\n")
      );

      const { object } = await generateObject({
        model: await getOrganizationTextModel(feature.organizationId),
        prompt,
        schema: z.object({
          reach: z.object({
            score: z.number(),
            reason: z.string(),
          }),
          impact: z.object({
            score: z.number(),
            reason: z.string(),
          }),
          confidence: z.object({
            score: z.number(),
            reason: z.string(),
          }),
          effort: z.object({
            score: z.number(),
            reason: z.string(),
          }),
        }),
      });

      await database.aiFeatureRice.upsert({
        where: { featureId: feature.id },
        update: {
          reach: object.reach.score,
          impact: object.impact.score,
          confidence: object.confidence.score,
          effort: object.effort.score,
          reachReason: object.reach.reason,
          impactReason: object.impact.reason,
          confidenceReason: object.confidence.reason,
          effortReason: object.effort.reason,
        },
        create: {
          reach: object.reach.score,
          impact: object.impact.score,
          confidence: object.confidence.score,
          effort: object.effort.score,
          reachReason: object.reach.reason,
          impactReason: object.impact.reason,
          confidenceReason: object.confidence.reason,
          effortReason: object.effort.reason,
          organizationId: feature.organizationId,
          featureId: feature.id,
        },
        select: { id: true },
      });
    } catch (error) {
      log.error("Opportunity scoring failed", error);
    }
  }
};
