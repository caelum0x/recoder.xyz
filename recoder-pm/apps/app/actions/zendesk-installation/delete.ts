"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export const deleteZendeskInstallation = async () => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    await database.zendeskInstallation.delete({
      where: { organizationId },
    });

    revalidatePath("/settings/integrations/zendesk");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
