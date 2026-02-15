"use server";

import { encryptApiKey } from "@repo/backend/ai-keys";
import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export const createZendeskInstallation = async (
  subdomain: string,
  email: string,
  apiToken: string
) => {
  try {
    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!(user && organizationId)) {
      throw new Error("Not authenticated");
    }

    if (!(subdomain.trim() && email.trim() && apiToken.trim())) {
      throw new Error("All fields are required");
    }

    await database.zendeskInstallation.upsert({
      where: { organizationId },
      update: {
        subdomain: subdomain.trim(),
        email: email.trim(),
        encryptedKey: encryptApiKey(apiToken.trim()),
        status: "ACTIVE",
      },
      create: {
        subdomain: subdomain.trim(),
        email: email.trim(),
        encryptedKey: encryptApiKey(apiToken.trim()),
        organizationId,
        creatorId: user.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    revalidatePath("/settings/integrations/zendesk");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
