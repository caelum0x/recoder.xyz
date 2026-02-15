"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { contentToText } from "@repo/editor/lib/tiptap";
import { parseError } from "@repo/lib/parse-error";
import { database } from "@/lib/database";

export const exportProposalSpec = async (proposalId: string) => {
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
        prdContent: true,
        taskBreakdown: true,
        status: true,
      },
    });

    if (!proposal) {
      throw new Error("Proposal not found");
    }

    const prdText = proposal.prdContent
      ? contentToText(proposal.prdContent)
      : "";

    const payload = {
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      status: proposal.status,
      prd: prdText,
      tasks: proposal.taskBreakdown ?? { tasks: [] },
    };

    return { payload };
  } catch (error) {
    return { error: parseError(error) };
  }
};
