"use server";

import { encryptApiKey } from "@repo/backend/ai-keys";
import { syncAnalyticsConnector as runSync } from "@repo/backend/analytics-connectors";
import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export type AnalyticsProvider = "MIXPANEL" | "AMPLITUDE" | "POSTHOG";

type UpsertConnectorPayload = {
  readonly provider: AnalyticsProvider;
  readonly apiKey?: string;
  readonly apiSecret?: string;
  readonly baseUrl?: string;
  readonly projectId?: string;
};

export const upsertAnalyticsConnector = async (
  payload: UpsertConnectorPayload
) => {
  try {
    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!(user && organizationId)) {
      throw new Error("Not authenticated");
    }

    const existing = await database.analyticsConnector.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: payload.provider,
        },
      },
    });

    const incomingSecret =
      payload.provider === "AMPLITUDE"
        ? payload.apiSecret?.trim()
        : payload.apiKey?.trim();

    if (!(existing || incomingSecret)) {
      throw new Error("API key is required to connect this provider.");
    }

    const encryptedKey = incomingSecret
      ? encryptApiKey(incomingSecret)
      : existing?.encryptedKey;

    const config = {
      baseUrl: payload.baseUrl?.trim() || undefined,
      apiKey:
        payload.provider === "AMPLITUDE"
          ? payload.apiKey?.trim() || undefined
          : undefined,
      projectId:
        payload.provider === "POSTHOG"
          ? payload.projectId?.trim() || undefined
          : undefined,
    };

    await database.analyticsConnector.upsert({
      where: {
        organizationId_provider: {
          organizationId,
          provider: payload.provider,
        },
      },
      update: {
        config,
        encryptedKey,
        status: "ACTIVE",
      },
      create: {
        provider: payload.provider,
        name: payload.provider.toLowerCase(),
        config,
        encryptedKey,
        organizationId,
        creatorId: user.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    revalidatePath("/settings/integrations/analytics");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};

export const deleteAnalyticsConnector = async (provider: AnalyticsProvider) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    await database.analyticsConnector.delete({
      where: {
        organizationId_provider: {
          organizationId,
          provider,
        },
      },
    });

    revalidatePath("/settings/integrations/analytics");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};

export const syncAnalyticsConnector = async (provider: AnalyticsProvider) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const connector = await database.analyticsConnector.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider,
        },
      },
      select: { id: true },
    });

    if (!connector) {
      throw new Error("Connector not found");
    }

    await runSync(connector.id);

    revalidatePath("/settings/integrations/analytics");

    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
