import "server-only";
import { log } from "@repo/observability/log";
import { generateObject } from "ai";
import { z } from "zod/v3";
import { getOrganizationTextModel } from "./ai";
import { withOrganizationUserPrompt } from "./ai-prompts";
import { database } from "./database";

const lookbackDays = 14;

export const generateProposals = async () => {
  const organizations = await database.organization.findMany({
    select: { id: true },
  });

  for (const organization of organizations) {
    try {
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

      const insights = await database.aiInsight.findMany({
        where: { organizationId: organization.id, createdAt: { gt: since } },
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          confidence: true,
        },
      });

      if (!insights.length) {
        continue;
      }

      const prompt = await withOrganizationUserPrompt(
        organization.id,
        [
          "You are an AI PM assistant. Propose 2-3 product change proposals derived from the insights.",
          "Each proposal needs a short title, description, and impact prediction fields.",
          "Impact prediction should include user impact, business impact, effort, and risk.",
          "Keep responses concise and avoid markdown.",
          "",
          "Insights:",
          ...insights.map(
            (insight) =>
              `- (${insight.type}, ${insight.confidence}%) ${insight.title}: ${insight.description}`
          ),
        ].join("\n")
      );

      const { object } = await generateObject({
        model: await getOrganizationTextModel(organization.id),
        prompt,
        schema: z.object({
          proposals: z.array(
            z.object({
              title: z.string(),
              description: z.string(),
              impactPrediction: z.object({
                userImpact: z.string(),
                businessImpact: z.string(),
                effort: z.string(),
                risk: z.string(),
              }),
              insightIds: z.array(z.string()),
            })
          ),
        }),
      });

      for (const proposal of object.proposals) {
        const exists = await database.proposal.findFirst({
          where: {
            organizationId: organization.id,
            title: proposal.title,
            createdAt: { gt: since },
          },
          select: { id: true },
        });

        if (exists) {
          continue;
        }

        const insightIds = proposal.insightIds.filter((id) =>
          insights.some((insight) => insight.id === id)
        );

        await database.proposal.create({
          data: {
            organizationId: organization.id,
            title: proposal.title,
            description: proposal.description,
            impactPrediction: proposal.impactPrediction,
            status: "DRAFT",
            insightIds,
          },
          select: { id: true },
        });
      }
    } catch (error) {
      log.error("Proposal generation failed", error as Record<string, unknown>);
    }
  }
};
