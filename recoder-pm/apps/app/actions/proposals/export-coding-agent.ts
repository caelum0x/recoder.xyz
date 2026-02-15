"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { buildClaudeCodePrompt, buildCursorPrompt } from "@repo/coding-agents";
import { contentToText } from "@repo/editor/lib/tiptap";
import { parseError } from "@repo/lib/parse-error";
import { database } from "@/lib/database";

export type CodingAgentTarget = "cursor" | "claude";

export const exportCodingAgentPrompt = async (
  proposalId: string,
  target: CodingAgentTarget
) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const proposal = await database.proposal.findFirst({
      where: { id: proposalId, organizationId },
      select: {
        title: true,
        prdContent: true,
        taskBreakdown: true,
      },
    });

    if (!proposal) {
      throw new Error("Proposal not found");
    }

    const prdText = proposal.prdContent
      ? contentToText(proposal.prdContent)
      : "";
    const breakdown = (proposal.taskBreakdown ?? {}) as {
      tasks?: {
        title: string;
        summary: string;
        acceptanceCriteria?: string[];
        labels?: string[];
        estimate?: number;
        priority?: "low" | "medium" | "high";
      }[];
    };

    const prompt =
      target === "claude"
        ? buildClaudeCodePrompt(proposal.title, prdText, breakdown)
        : buildCursorPrompt(proposal.title, prdText, breakdown);

    return { prompt };
  } catch (error) {
    return { error: parseError(error) };
  }
};
