"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { generateTaskBreakdown } from "@repo/backend/task-decomposer";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";

export const generateProposalTasks = async (proposalId: string) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    await generateTaskBreakdown(proposalId);

    revalidatePath(`/proposals/${proposalId}/prd`);

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
