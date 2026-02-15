"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { syncSessionRecordingInsights } from "@repo/backend/session-recordings";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export const syncSessionRecordings = async () => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const org = await database.organization.findUnique({
      where: { id: organizationId },
      select: { sessionRecordingProvider: true },
    });

    if (!org?.sessionRecordingProvider) {
      throw new Error("No session recording provider connected");
    }

    await syncSessionRecordingInsights();

    revalidatePath("/settings/integrations/session-recordings");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
