"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export const updateProposalPrd = async (
  proposalId: string,
  content: object
) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    await database.proposal.update({
      where: { id: proposalId },
      data: {
        prdContent: content,
        prdUpdatedAt: new Date(),
      },
      select: { id: true },
    });

    revalidatePath(`/proposals/${proposalId}/prd`);

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
