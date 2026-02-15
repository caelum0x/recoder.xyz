"use server";

import { RecoderPmRole } from "@repo/backend/auth";
import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

type UpdateAiPromptInput = {
  prompt: string;
};

export const updateAiPrompt = async ({
  prompt,
}: UpdateAiPromptInput): Promise<{ error?: string }> => {
  try {
    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!(user && organizationId)) {
      throw new Error("Not logged in");
    }

    if (user.user_metadata.organization_role !== RecoderPmRole.Admin) {
      throw new Error("You do not have permission to update AI settings");
    }

    const sanitized = prompt.trim();

    await database.organization.update({
      where: { id: organizationId },
      data: {
        aiPrompt: sanitized.length > 0 ? sanitized : null,
      },
      select: { id: true },
    });

    revalidatePath("/settings/ai");

    return {};
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
