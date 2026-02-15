"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { generateProposalPrd } from "@repo/backend/prd-generator";
import { generateTaskBreakdown } from "@repo/backend/task-decomposer";
import { buildClaudeCodePrompt, buildCursorPrompt } from "@repo/coding-agents";
import { contentToText } from "@repo/editor/lib/tiptap";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

type TaskBreakdown = {
  tasks?: {
    title: string;
    summary: string;
    acceptanceCriteria?: string[];
    labels?: string[];
    estimate?: number;
    priority?: "low" | "medium" | "high";
  }[];
};

export const runSpecToCodePipeline = async (proposalId: string) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const proposal = await database.proposal.findFirst({
      where: { id: proposalId, organizationId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        prdContent: true,
        taskBreakdown: true,
      },
    });

    if (!proposal) {
      throw new Error("Proposal not found");
    }

    if (!proposal.prdContent) {
      await generateProposalPrd(proposalId);
    }

    if (!proposal.taskBreakdown) {
      await generateTaskBreakdown(proposalId);
    }

    const updated = await database.proposal.findFirst({
      where: { id: proposalId, organizationId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        prdContent: true,
        taskBreakdown: true,
      },
    });

    if (!updated) {
      throw new Error("Proposal not found after pipeline run");
    }

    const prdText = updated.prdContent ? contentToText(updated.prdContent) : "";
    const breakdown = (updated.taskBreakdown ?? { tasks: [] }) as TaskBreakdown;

    const cursorPrompt = buildCursorPrompt(updated.title, prdText, breakdown);
    const claudePrompt = buildClaudeCodePrompt(
      updated.title,
      prdText,
      breakdown
    );

    const spec = {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      prd: prdText,
      tasks: breakdown,
    };

    revalidatePath(`/proposals/${proposalId}/prd`);
    revalidatePath(`/proposals/${proposalId}/pipeline`);

    return {
      payload: {
        prdText,
        tasks: breakdown,
        cursorPrompt,
        claudePrompt,
        spec,
      },
    };
  } catch (error) {
    return { error: parseError(error) };
  }
};
