import "server-only";
import { textToContent } from "@repo/editor/lib/tiptap";
import { generateObject } from "ai";
import { z } from "zod/v3";
import { getOrganizationTextModel } from "./ai";
import { withOrganizationUserPrompt } from "./ai-prompts";
import { database } from "./database";

export const generateProposalPrd = async (proposalId: string) => {
  const proposal = await database.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      title: true,
      description: true,
      impactPrediction: true,
      organizationId: true,
    },
  });

  if (!proposal) {
    throw new Error("Proposal not found");
  }

  const impact = (proposal.impactPrediction ?? {}) as Record<string, string>;

  const { object } = await generateObject({
    model: await getOrganizationTextModel(proposal.organizationId),
    prompt: await withOrganizationUserPrompt(
      proposal.organizationId,
      [
        "You are a PM writing a product requirements document (PRD).",
        "Write a clear, concise PRD with the following sections:",
        "Overview, Problem, Goals, Non-Goals, User Stories, Requirements, UX Notes, Metrics, Risks, Rollout.",
        "Keep it short but actionable. Avoid markdown symbols; write plain text with section headings.",
        "",
        `Proposal: ${proposal.title}`,
        proposal.description,
        "",
        "Impact prediction:",
        `User impact: ${impact.userImpact ?? "N/A"}`,
        `Business impact: ${impact.businessImpact ?? "N/A"}`,
        `Effort: ${impact.effort ?? "N/A"}`,
        `Risk: ${impact.risk ?? "N/A"}`,
      ].join("\n")
    ),
    schema: z.object({
      prd: z.string(),
    }),
  });

  const content = textToContent(object.prd);

  await database.proposal.update({
    where: { id: proposal.id },
    data: {
      prdContent: content,
      prdUpdatedAt: new Date(),
    },
    select: { id: true },
  });

  return content;
};
