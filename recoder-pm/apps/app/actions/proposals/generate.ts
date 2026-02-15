"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { generateProposals } from "@repo/backend/proposal-generator";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";

export const generateProposalsForOrganization = async () => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    await generateProposals();

    revalidatePath("/proposals");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
