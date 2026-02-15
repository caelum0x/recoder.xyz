import "server-only";
import { contentToText } from "@repo/editor/lib/tiptap";
import { generateObject } from "ai";
import { z } from "zod/v3";
import { getOrganizationTextModel } from "./ai";
import { withOrganizationUserPrompt } from "./ai-prompts";
import { database } from "./database";

export const generateTaskBreakdown = async (proposalId: string) => {
  const proposal = await database.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      title: true,
      description: true,
      prdContent: true,
      organizationId: true,
    },
  });

  if (!proposal) {
    throw new Error("Proposal not found");
  }

  const prdText = proposal.prdContent ? contentToText(proposal.prdContent) : "";

  const { object } = await generateObject({
    model: await getOrganizationTextModel(proposal.organizationId),
    prompt: await withOrganizationUserPrompt(
      proposal.organizationId,
      [
        "You are an engineering manager. Decompose the PRD into a concise task list.",
        "Each task should be compatible with GitHub Issues or Linear.",
        "Provide 6-12 tasks max, ordered by execution.",
        "Keep it short and clear.",
        "",
        `Proposal: ${proposal.title}`,
        proposal.description,
        "",
        prdText ? `PRD:\n${prdText}` : "PRD: Not provided.",
      ].join("\n")
    ),
    schema: z.object({
      tasks: z.array(
        z.object({
          title: z.string(),
          summary: z.string(),
          acceptanceCriteria: z.array(z.string()).optional(),
          labels: z.array(z.string()).optional(),
          estimate: z.number().optional(),
          priority: z.enum(["low", "medium", "high"]).optional(),
        })
      ),
    }),
  });

  await database.proposal.update({
    where: { id: proposal.id },
    data: {
      taskBreakdown: object,
      taskBreakdownUpdatedAt: new Date(),
    },
    select: { id: true },
  });

  return object;
};
