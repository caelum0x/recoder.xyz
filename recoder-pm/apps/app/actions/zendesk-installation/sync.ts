"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { syncZendeskInstallationById } from "@repo/backend/support-tickets";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export const syncZendeskInstallation = async () => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const installation = await database.zendeskInstallation.findUnique({
      where: { organizationId },
      select: { id: true },
    });

    if (!installation) {
      throw new Error("Zendesk installation not found");
    }

    await syncZendeskInstallationById(installation.id);

    revalidatePath("/settings/integrations/zendesk");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
