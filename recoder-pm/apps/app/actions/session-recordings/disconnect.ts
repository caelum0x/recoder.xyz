"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export const disconnectSessionRecordings = async () => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    await database.organization.update({
      where: { id: organizationId },
      data: {
        sessionRecordingProvider: null,
        sessionRecordingEncryptedKey: null,
        sessionRecordingConfig: null,
        sessionRecordingLastSyncedAt: null,
      },
      select: { id: true },
    });

    revalidatePath("/settings/integrations/session-recordings");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
