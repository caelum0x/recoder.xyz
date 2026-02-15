"use server";

import { encryptApiKey } from "@repo/backend/ai-keys";
import { currentOrganizationId } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export type SessionRecordingProvider = "FULLSTORY" | "HOTJAR";

type UpdateSessionRecordingPayload = {
  readonly provider: SessionRecordingProvider;
  readonly apiKey?: string;
  readonly siteId?: string;
};

export const updateSessionRecordingSettings = async (
  payload: UpdateSessionRecordingPayload
) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const apiKey = payload.apiKey?.trim();

    if (!apiKey) {
      throw new Error("API key is required");
    }

    const config =
      payload.provider === "HOTJAR"
        ? {
            siteId: payload.siteId?.trim() || undefined,
          }
        : {};

    if (payload.provider === "HOTJAR" && !config.siteId) {
      throw new Error("Hotjar site ID is required");
    }

    await database.organization.update({
      where: { id: organizationId },
      data: {
        sessionRecordingProvider: payload.provider,
        sessionRecordingEncryptedKey: encryptApiKey(apiKey),
        sessionRecordingConfig: config,
      },
      select: { id: true },
    });

    revalidatePath("/settings/integrations/session-recordings");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
